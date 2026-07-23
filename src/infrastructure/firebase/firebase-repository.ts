/**
 * Firestore adapter.
 *
 * Implements the same `FarmRepository` contract as the demo adapter, so no
 * component changes when you flip NEXT_PUBLIC_DATA_SOURCE.
 *
 * Two rules govern everything below:
 *  1. Never fan out. Anything that could return 50,000 documents takes a bound.
 *  2. Filter and sort in Firestore, not in JavaScript. A client-side `.filter()`
 *     over a paginated result silently searches only the page you loaded.
 */

import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocFromCache,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Query,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { getFirebase } from "./client";
import { PREFIX_END, animalSearchFields, paths } from "./paths";
import { getActiveFarm } from "./tenant";
import type {
  Account,
  Branch,
  Cheque,
  Currency,
  LivestockTransfer,
  Warehouse,
  WorkOrder,
  ChequeStatus,
  Alert,
  Animal,
  AnimalDisposal,
  Asset,
  Attendance,
  BreedingEvent,
  DailyMilkPoint,
  Employee,
  Farm,
  FarmTask,
  FeedConsumption,
  FeedItem,
  FeedRation,
  FiscalYear,
  HealthEvent,
  ID,
  InventoryItem,
  Invoice,
  JournalEntry,
  Member,
  MilkRecord,
  Partner,
  PendingInvite,
  Role,
  SemenStraw,
  StockMovement,
  TimelineEntry,
  Transaction,
  UtilityReading,
  WeatherNow,
  Zone,
} from "@/core/domain/types";
import type {
  AnimalQuery,
  AttendanceInput,
  LivestockTransferInput,
  StockTransferInput,
  StocktakeInput,
  EventWrite,
  FarmRepository,
  FeedConsumptionInput,
  InvoicePaymentInput,
  MilkSessionInput,
  Page,
  WriteOutcome,
} from "@/core/repositories/farm-repository";
import { invoiceTotal } from "@/core/repositories/farm-repository";
import { trackWrite } from "@/lib/sync/offline-store";
import {
  applyBreedingEvent,
  applyHealthEvent,
  attendanceFromClock,
  kgPerUnit,
} from "@/core/domain/rules";
import { addDays, toISODate } from "@/lib/date";
import { defaultChartOfAccounts } from "@/core/data/chart-of-accounts";
import { isBalanced } from "@/core/services/accounting";
import {
  chequeNumber,
  invoiceDocNumber,
  invoiceSeries,
  nextSequence,
  journalEntryFromCheque,
  journalEntryFromInvoice,
  journalEntryFromInvoicePayment,
  voucherNumber,
  journalEntryFromTransaction,
  journalNumber,
  type ChequePhase,
} from "@/core/services/posting";
import {
  FEED_EXPENSE_CATEGORY,
  INVENTORY_EXPENSE_CATEGORY,
  blendedUnitCost,
  purchaseTotal,
  livestockAssetFor,
  type CostInput,
  type PurchaseInput,
} from "@/core/services/automation";
import { checkTransfer, commonOrigin, transferNumber } from "@/core/services/livestock";
import { isValidRate } from "@/core/services/org";
import {
  allocateOutputCosts,
  checkWorkOrder,
  workOrderCost,
  workOrderNumber,
} from "@/core/services/production";
import {
  DEFAULT_WAREHOUSE_ID,
  stockInWarehouse,
  stocktakeVariance,
} from "@/core/services/warehouse";
import { round } from "@/lib/utils";

/**
 * Firestore rejects `undefined` outright, so it has to be handled explicitly —
 * and the right handling differs by operation.
 *
 * On a create there is nothing to clear, so undefined fields are dropped.
 */
function omitUndefined<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

/**
 * On an update, undefined means "clear this" — an open cow must lose her
 * expected calving date, not keep a stale one. Dropping the key would silently
 * leave the old value in place, which is how a cow ends up permanently
 * pregnant on the dashboard.
 */
function clearUndefined<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, v === undefined ? deleteField() : v]),
  );
}

/** Collection reads that back whole-page analytics. Bounded, deliberately. */
const ANALYTIC_LIMIT = 5000;

/**
 * How many journal entries the books are read from. Exported so the UI can spot
 * a truncated ledger and say so, rather than showing confident wrong totals.
 */
export const LEDGER_READ_LIMIT = 20_000;

function rows<T>(snap: { docs: QueryDocumentSnapshot<DocumentData>[] }): T[] {
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

/** Firestore Timestamp / {seconds} / ISO string → ISO string. */
function toIso(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as { toDate?: () => Date; seconds?: number };
    if (typeof o.toDate === "function") return o.toDate().toISOString();
    if (typeof o.seconds === "number") return new Date(o.seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

const ALERT_CATEGORIES = new Set([
  "health", "breeding", "milk", "inventory", "weather", "task", "finance", "system",
]);

// The Cloud Function tags alerts with a `kind`; map it to the UI's category so
// function-raised alerts still get the right icon instead of the system default.
const KIND_TO_CATEGORY: Record<string, Alert["category"]> = {
  calving_due: "breeding",
  vaccination_due: "health",
  quarantine: "health",
  low_stock: "inventory",
  expiring_stock: "inventory",
  milk_drop: "milk",
  missed_milking: "milk",
  overdue_tasks: "task",
};

/**
 * Coerce a stored alert into the shape the UI expects. Alerts raised by the
 * Cloud Function land with a Firestore Timestamp `createdAt`, no `channels`, and
 * a `kind` in place of `category` — normalising all three here means the list
 * can't crash on a function-generated row (the UI assumes a string date and an
 * iterable `channels`).
 */
function normalizeAlert(a: Record<string, unknown>): Alert {
  const category = ALERT_CATEGORIES.has(a.category as string)
    ? (a.category as string)
    : KIND_TO_CATEGORY[a.kind as string] ?? "system";
  const channels = Array.isArray(a.channels) && a.channels.length ? a.channels : ["in_app"];
  return {
    ...(a as unknown as Alert),
    createdAt: toIso(a.createdAt),
    category: category as Alert["category"],
    channels: channels as Alert["channels"],
    animalId: (a.animalId ?? a.subjectId) as string | undefined,
    read: Boolean(a.read),
  };
}

export class FirebaseFarmRepository implements FarmRepository {
  readonly source = "firebase" as const;
  private readonly fixedFarmId?: string;

  // An explicit farmId pins the repo to one farm (admin tooling); the app passes
  // none, so `farmId` follows the signed-in user's active farm at call time —
  // which lets one long-lived repo serve whatever farm the user belongs to.
  constructor(farmId?: string) {
    this.fixedFarmId = farmId;
  }

  private get farmId(): string {
    return this.fixedFarmId ?? getActiveFarm();
  }

  private get db() {
    return getFirebase().db;
  }

  private col(path: string) {
    return collection(this.db, path);
  }

  private async all<T>(path: string, ...constraints: QueryConstraint[]): Promise<T[]> {
    const snap = await getDocs(query(this.col(path), ...constraints));
    return rows<T>(snap);
  }

  /* ---------------------------------- Farm -------------------------------- */

  async getFarm(): Promise<Farm> {
    const snap = await getDoc(doc(this.db, paths.farm(this.farmId)));
    if (!snap.exists()) throw new Error(`Farm ${this.farmId} not found. Run the seed script.`);
    return { id: snap.id, ...snap.data() } as Farm;
  }

  getZones = () => this.all<Zone>(paths.zones(this.farmId), orderBy("name"));

  /* ---------------------------------- Team --------------------------------- */

  getMembers = () => this.all<Member>(paths.members(this.farmId), orderBy("email"));

  getPendingInvites = () =>
    this.all<PendingInvite>(paths.pendingMembers(this.farmId), orderBy("email"));

  async inviteMember(email: string, role: Role): Promise<PendingInvite> {
    const key = email.trim().toLowerCase();
    const invite: PendingInvite = { email: key, role, invitedAt: new Date().toISOString() };
    // Keyed by email so re-inviting updates the role rather than duplicating.
    await setDoc(doc(this.db, paths.pendingMembers(this.farmId), key), invite);
    return invite;
  }

  async setMemberRole(uid: ID, role: Role): Promise<void> {
    // Owners keep the wildcard; a demotion strips it so the rules stop treating
    // them as owner the instant the role changes.
    await updateDoc(doc(this.db, paths.members(this.farmId), uid), {
      role,
      permissions: role === "owner" ? ["*"] : [],
    });
  }

  async removeMember(uid: ID): Promise<void> {
    await deleteDoc(doc(this.db, paths.members(this.farmId), uid));
  }

  async revokeInvite(email: string): Promise<void> {
    await deleteDoc(doc(this.db, paths.pendingMembers(this.farmId), email.trim().toLowerCase()));
  }

  /* --------------------------------- Animals ------------------------------- */

  /**
   * Paginated herd query.
   *
   * Equality filters and the sort run in Firestore against composite indexes
   * (see firestore.indexes.json). Search is a prefix range on tag and name,
   * fired as two parallel queries and merged — Firestore can't OR ranges across
   * two fields in one query, and substring search needs a real search index.
   */
  async listAnimals(q: AnimalQuery = {}): Promise<Page<Animal>> {
    const {
      search = "",
      status = "all",
      milkStatus = "all",
      reproStatus = "all",
      penId = "all",
      breed = "all",
      sex = "all",
      group = "all",
      sortBy = "tag",
      sortDir = "asc",
      page = 1,
      pageSize = 25,
    } = q;

    const term = search.trim().toLowerCase();
    if (term) return this.searchAnimals(term, pageSize);

    const constraints: QueryConstraint[] = [];
    if (status !== "all") constraints.push(where("status", "==", status));
    if (milkStatus !== "all") constraints.push(where("milkStatus", "==", milkStatus));
    if (reproStatus !== "all") constraints.push(where("reproStatus", "==", reproStatus));
    if (penId !== "all") constraints.push(where("penId", "==", penId));
    if (breed !== "all") constraints.push(where("breed", "==", breed));
    if (sex !== "all") constraints.push(where("sex", "==", sex));
    if (group === "calves") constraints.push(where("isCalf", "==", true));
    if (group === "bulls") {
      constraints.push(where("sex", "==", "male"), where("isCalf", "==", false));
    }
    if (group === "adults") {
      constraints.push(where("sex", "==", "female"), where("isCalf", "==", false));
    }

    const sortField =
      sortBy === "milk"
        ? "avgDailyMilkL"
        : sortBy === "age"
          ? "dateOfBirth"
          : sortBy === "weight"
            ? "weightKg"
            : sortBy === "health"
              ? "healthScore"
              : sortBy === "name"
                ? "nameLower"
                : "tag";

    // "Age ascending" means oldest first, which is dateOfBirth ascending.
    const dir = sortDir;
    const base = query(this.col(paths.animals(this.farmId)), ...constraints, orderBy(sortField, dir));

    // Firestore rejects any single query whose limit exceeds 10,000. Callers ask
    // for the whole herd (pageSize 100000) to compute aggregates, so when the
    // request won't fit in one query, page through it in max-size batches and
    // return everything. This is the path the dashboard, herd summary, analytics
    // and the advisor all take; it scales to a 50k+ herd (a handful of batches).
    const FS_LIMIT = 10_000;
    if (pageSize > FS_LIMIT) {
      const items: Animal[] = [];
      let batchCursor: QueryDocumentSnapshot<DocumentData> | null = null;
      for (;;) {
        const batchQuery: Query<DocumentData> = batchCursor
          ? query(base, startAfter(batchCursor), fsLimit(FS_LIMIT))
          : query(base, fsLimit(FS_LIMIT));
        const batch = await getDocs(batchQuery);
        if (batch.empty) break;
        items.push(...rows<Animal>(batch));
        if (batch.size < FS_LIMIT) break;
        batchCursor = batch.docs[batch.docs.length - 1];
      }
      const total = await this.animalCount(constraints.length ? undefined : "total");
      return { items, total, page: 1, pageSize };
    }

    // Cursor pagination: walk to the requested page. Cheap for the first pages,
    // which is all a human ever clicks; deep links should carry a cursor.
    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
    for (let p = 1; p < page; p++) {
      const step: Query<DocumentData> = cursor
        ? query(base, startAfter(cursor), fsLimit(pageSize))
        : query(base, fsLimit(pageSize));
      const snap = await getDocs(step);
      if (snap.empty) break;
      cursor = snap.docs[snap.docs.length - 1];
    }

    const pageQuery: Query<DocumentData> = cursor
      ? query(base, startAfter(cursor), fsLimit(pageSize))
      : query(base, fsLimit(pageSize));
    const snap = await getDocs(pageQuery);

    // Firestore has no cheap COUNT over a filtered set at this size. The farm
    // document carries counters maintained by a Cloud Function trigger.
    const total = await this.animalCount(constraints.length ? undefined : "total");

    return { items: rows<Animal>(snap), total, page, pageSize };
  }

  private async searchAnimals(term: string, pageSize: number): Promise<Page<Animal>> {
    const col = this.col(paths.animals(this.farmId));
    // A prefix search never needs more than a screenful; cap at Firestore's
    // 10,000 limit ceiling so a caller's "fetch all" pageSize can't blow up.
    const cap = Math.min(pageSize, 10_000);
    const prefix = (field: string) =>
      getDocs(
        query(
          col,
          orderBy(field),
          where(field, ">=", term),
          where(field, "<=", term + PREFIX_END),
          fsLimit(cap),
        ),
      );

    const [byTag, byName, byRfid] = await Promise.all([
      prefix("tagLower"),
      prefix("nameLower"),
      prefix("rfidLower"),
    ]);

    const merged = new Map<string, Animal>();
    [byTag, byName, byRfid].forEach((snap) =>
      rows<Animal>(snap).forEach((a) => merged.set(a.id, a)),
    );
    const items = [...merged.values()].sort((a, b) => a.tag.localeCompare(b.tag));

    return { items: items.slice(0, cap), total: items.length, page: 1, pageSize };
  }

  private async animalCount(counter?: string): Promise<number> {
    const snap = await getDoc(doc(this.db, paths.farm(this.farmId)));
    const counts = (snap.data()?.counts ?? {}) as Record<string, number>;
    return counts[counter ?? "total"] ?? counts.total ?? 0;
  }

  async getAnimal(id: ID): Promise<Animal | null> {
    const snap = await getDoc(doc(this.db, paths.animals(this.farmId), id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Animal) : null;
  }

  async getAnimalTimeline(id: ID): Promise<TimelineEntry[]> {
    const [animal, health, breeding] = await Promise.all([
      this.getAnimal(id),
      this.all<HealthEvent>(paths.health(this.farmId), where("animalId", "==", id)),
      this.all<BreedingEvent>(paths.breeding(this.farmId), where("animalId", "==", id)),
    ]);
    if (!animal) return [];

    const entries: TimelineEntry[] = [
      {
        id: `tl_birth_${id}`,
        date: animal.dateOfBirth,
        kind: "birth",
        title: animal.acquiredFrom === "purchased" ? "Purchased and registered" : "Born on farm",
        titleAr: animal.acquiredFrom === "purchased" ? "تم الشراء والتسجيل" : "ولدت في المزرعة",
        detail: `Tag ${animal.tag}`,
        detailAr: `رقم ${animal.tag}`,
      },
    ];

    health.forEach((h) =>
      entries.push({
        id: h.id,
        date: h.date,
        kind: "health",
        title:
          h.type === "vaccination"
            ? `Vaccinated — ${h.vaccine}`
            : `Diagnosed — ${h.disease?.replace(/_/g, " ")}`,
        titleAr: h.type === "vaccination" ? `تطعيم — ${h.vaccine}` : `تشخيص — ${h.disease}`,
        detail: h.medication ? `${h.medication} · ${h.dosage ?? ""}` : h.vetName,
        detailAr: h.vetName,
      }),
    );

    breeding.forEach((b) =>
      entries.push({
        id: b.id,
        date: b.date,
        kind: "breeding",
        title:
          b.type === "calving"
            ? `Calved (${b.outcome ?? "live"})`
            : b.type === "ai"
              ? `Inseminated · batch ${b.semenBatch}`
              : b.type.replace(/_/g, " "),
        titleAr: b.type === "calving" ? "ولادة" : b.type === "ai" ? "تلقيح صناعي" : "حدث تناسلي",
        detail: b.technician ?? b.notes,
        detailAr: b.technician,
      }),
    );

    if (animal.expectedCalvingDate) {
      entries.push({
        id: `tl_due_${id}`,
        date: animal.expectedCalvingDate,
        kind: "breeding",
        title: "Expected calving",
        titleAr: "الولادة المتوقعة",
      });
    }

    return entries.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getAnimalMilkHistory(id: ID, days = 120): Promise<MilkRecord[]> {
    const from = addDays(toISODate(new Date()), -days);
    return this.all<MilkRecord>(
      paths.milkRecords(this.farmId),
      where("animalId", "==", id),
      where("date", ">=", from),
      orderBy("date", "asc"),
    );
  }

  async getAnimalWeightHistory(id: ID) {
    const snaps = await this.all<{ id: string; date: string; weightKg: number }>(
      `${paths.animals(this.farmId)}/${id}/weights`,
      orderBy("date", "asc"),
    );
    if (snaps.length) return snaps.map((s) => ({ date: s.date, weightKg: s.weightKg }));
    // No scale integration yet on this animal — one point beats an empty chart.
    const animal = await this.getAnimal(id);
    return animal ? [{ date: toISODate(new Date()), weightKg: animal.weightKg }] : [];
  }

  async saveAnimal(patch: Partial<Animal> & { id?: ID }): Promise<Animal> {
    const id = patch.id ?? doc(this.col(paths.animals(this.farmId))).id;
    const searchable =
      patch.tag && patch.name
        ? animalSearchFields({
            tag: patch.tag,
            name: patch.name,
            nameAr: patch.nameAr ?? patch.name,
            rfid: patch.rfid ?? "",
          })
        : {};
    const ref = doc(this.db, paths.animals(this.farmId), id);
    await setDoc(ref, { ...patch, ...searchable, farmId: this.farmId }, { merge: true });
    const saved = (await this.getAnimal(id))!;

    // An animal bought for money is capital — mirror its purchase price into
    // the asset register rather than booking it as an expense.
    const asset = livestockAssetFor(saved);
    if (asset) {
      await setDoc(
        doc(this.db, paths.assets(this.farmId), asset.id),
        omitUndefined({ ...asset, farmId: this.farmId }),
        { merge: true },
      );
    }
    return saved;
  }

  async disposeAnimal(id: ID, disposal: AnimalDisposal): Promise<Animal> {
    const status: Animal["status"] =
      disposal.type === "sold" ? "sold" : disposal.type === "culled" ? "culled" : "dead";
    const batch = writeBatch(this.db);
    batch.set(
      doc(this.db, paths.animals(this.farmId), id),
      { status, disposal: omitUndefined(disposal), farmId: this.farmId },
      { merge: true },
    );
    // A sale is money in — post the linked animal-sale income in the same batch
    // so the herd and the ledger never disagree.
    if (disposal.type === "sold" && (disposal.proceeds ?? 0) > 0) {
      const tag = (await this.getAnimal(id))?.tag ?? id;
      const txId = doc(this.col(paths.transactions(this.farmId))).id;
      batch.set(
        doc(this.db, paths.transactions(this.farmId), txId),
        omitUndefined({
          id: txId,
          farmId: this.farmId,
          date: disposal.date,
          kind: "income",
          category: "animal_sales",
          amount: disposal.proceeds,
          description: `Sale of ${tag}`,
          animalId: id,
          counterpartyId: disposal.buyerId,
          paymentMethod: "cash",
        }),
      );
    }
    await trackWrite(batch.commit());
    return (await this.getAnimal(id))!;
  }

  /* ----------------------------------- Milk -------------------------------- */

  async getMilkDaily(days = 730): Promise<DailyMilkPoint[]> {
    const from = addDays(toISODate(new Date()), -days);
    const list = await this.all<DailyMilkPoint & { id: string }>(
      paths.milkDaily(this.farmId),
      where("date", ">=", from),
      orderBy("date", "asc"),
    );
    return list;
  }

  getMilkRecords = (date: string) =>
    this.all<MilkRecord>(paths.milkRecords(this.farmId), where("date", "==", date));

  /**
   * Records a parlor session and rolls the herd aggregate forward in the same
   * batch. The dashboard reads `milkDaily`, never a fan-out over per-animal
   * rows — at 50k head that query would be 100,000 documents a day.
   */
  async recordMilkSession(input: MilkSessionInput): Promise<WriteOutcome> {
    const { date, session, entries } = input;
    const batch = writeBatch(this.db);

    entries.forEach((entry) => {
      const id = `${date}_${entry.animalId}_${session}`;
      batch.set(doc(this.db, paths.milkRecords(this.farmId), id), {
        farmId: this.farmId,
        animalId: entry.animalId,
        date,
        session,
        volumeL: entry.volumeL,
        rejectedL: entry.rejectedL ?? 0,
        fatPct: input.fatPct ?? 0,
        proteinPct: input.proteinPct ?? 0,
        somaticCellCount: input.somaticCellCount ?? 0,
        temperatureC: input.temperatureC ?? 0,
        workerId: input.workerId ?? null,
        machineId: input.machineId ?? null,
        // Server clock, not the tablet's — the rules use this to freeze a
        // record two days after it was taken, and a phone with a wrong date
        // must not be able to reopen last month's numbers.
        recordedAt: serverTimestamp(),
      });
    });

    const sessionTotal = entries.reduce((s, e) => s + e.volumeL, 0);
    const rejected = entries.reduce((s, e) => s + (e.rejectedL ?? 0), 0);

    // Read-then-write so re-recording a session corrects rather than doubles.
    // This has to survive the parlor: offline, possibly on a day this device has
    // never cached (the first session of the morning with no signal). A plain
    // getDoc throws `unavailable` there, so read from the cache when offline and
    // treat a miss as a fresh day rather than stranding the milker. The write
    // itself is already offline-safe — batch.commit persists locally and syncs.
    const dailyRef = doc(this.db, paths.milkDaily(this.farmId), date);
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    let prev: Partial<DailyMilkPoint> = {};
    try {
      const existing = offline ? await getDocFromCache(dailyRef) : await getDoc(dailyRef);
      prev = (existing.data() ?? {}) as Partial<DailyMilkPoint>;
    } catch {
      prev = {}; // offline with nothing cached for this date → start at zero
    }
    const morningL = session === "morning" ? sessionTotal : (prev.morningL ?? 0);
    const eveningL = session === "evening" ? sessionTotal : (prev.eveningL ?? 0);

    batch.set(
      dailyRef,
      {
        farmId: this.farmId,
        date,
        morningL: round(morningL, 1),
        eveningL: round(eveningL, 1),
        totalL: round(morningL + eveningL, 1),
        rejectedL: round((prev.rejectedL ?? 0) + rejected, 1),
        avgFat: input.fatPct ?? prev.avgFat ?? 0,
        avgProtein: input.proteinPct ?? prev.avgProtein ?? 0,
        milkingCows: Math.max(entries.length, prev.milkingCows ?? 0),
      },
      { merge: true },
    );

    // Fire the write and let the UI move on. Firestore has already applied it to
    // the local cache and persisted the mutation, so it survives a reload and
    // syncs on its own; blocking on the server ack is what stranded a milker in
    // a spinner when the signal dropped.
    return trackWrite(batch.commit());
  }

  /* ---------------------------- Event writes ------------------------------- */

  /**
   * Writes a document and a derived patch to a second document, atomically.
   *
   * The two must never half-apply — a calving that records the event but fails
   * to move the cow to `fresh` leaves her pregnant forever on the dashboard, and
   * nobody notices until she doesn't calve again.
   *
   * Online, that guarantee is a real transaction: a fresh server read, isolated
   * from concurrent edits. Offline, a transaction is impossible (it needs a
   * server round-trip), so we fall back to reading the target from the local
   * cache and writing both documents in one batch — still atomic, still durable,
   * and it syncs when the signal returns instead of erroring in the vet's hand.
   * The isolation we give up offline only matters if two people edit the same
   * animal in the same outage, which on a farm effectively never happens.
   */
  private async writeWithDerivedPatch(params: {
    writeRef: ReturnType<typeof doc>;
    writeData: Record<string, unknown>;
    patchRef: ReturnType<typeof doc>;
    derive: (current: DocumentData) => Record<string, unknown>;
    missing: string;
  }): Promise<WriteOutcome> {
    const { writeRef, writeData, patchRef, derive, missing } = params;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      let snap;
      try {
        snap = await getDocFromCache(patchRef);
      } catch {
        throw new Error(`${missing} — open it once while online, then this will work offline.`);
      }
      if (!snap.exists()) throw new Error(missing);

      const patch = clearUndefined(derive(snap.data()));
      const batch = writeBatch(this.db);
      batch.set(writeRef, omitUndefined(writeData));
      if (Object.keys(patch).length) batch.update(patchRef, patch as DocumentData);
      return trackWrite(batch.commit());
    }

    await runTransaction(this.db, async (txn) => {
      const snap = await txn.get(patchRef);
      if (!snap.exists()) throw new Error(missing);
      const patch = clearUndefined(derive(snap.data()));
      txn.set(writeRef, omitUndefined(writeData));
      if (Object.keys(patch).length) txn.update(patchRef, patch as DocumentData);
    });
    return "acked";
  }

  /** Event + implied animal change, offline-safe. */
  private async writeEventWithAnimalPatch<T extends { animalId: ID; id?: ID }>(
    collectionPath: string,
    event: T,
    derivePatch: (animal: Animal) => Partial<Animal>,
  ): Promise<T & { id: ID }> {
    const id = event.id ?? doc(this.col(collectionPath)).id;
    await this.writeWithDerivedPatch({
      writeRef: doc(this.db, collectionPath, id),
      writeData: { ...event, id, farmId: this.farmId },
      patchRef: doc(this.db, paths.animals(this.farmId), event.animalId),
      derive: (data) => derivePatch({ id: event.animalId, ...data } as Animal),
      missing: `Animal ${event.animalId} not found`,
    });
    return { ...event, id };
  }

  async saveHealthEvent(
    event: EventWrite<Omit<HealthEvent, "id" | "farmId">>,
  ): Promise<HealthEvent> {
    const saved = await this.writeEventWithAnimalPatch(
      paths.health(this.farmId),
      event,
      (animal) => ({
        ...applyHealthEvent(animal, event),
        // Withdrawal only ever extends — a second treatment can't shorten the
        // period the first one started.
        ...(event.withdrawalUntil &&
        (!animal.withdrawalUntil || event.withdrawalUntil > animal.withdrawalUntil)
          ? { withdrawalUntil: event.withdrawalUntil }
          : {}),
      }),
    );
    return saved as HealthEvent;
  }

  async saveBreedingEvent(
    event: EventWrite<Omit<BreedingEvent, "id" | "farmId">>,
  ): Promise<BreedingEvent> {
    const saved = await this.writeEventWithAnimalPatch(
      paths.breeding(this.farmId),
      event,
      (animal) => applyBreedingEvent(animal, event),
    );
    return saved as BreedingEvent;
  }

  async saveStockMovement(
    move: EventWrite<Omit<StockMovement, "id" | "farmId">>,
  ): Promise<StockMovement> {
    const id = move.id ?? doc(this.col(paths.stockMovements(this.farmId))).id;

    // Signed so the stock level and the movement log can never disagree about
    // direction — the sign lives in one place, here.
    const delta =
      move.kind === "in"
        ? Math.abs(move.quantity)
        : move.kind === "adjustment"
          ? move.quantity
          : -Math.abs(move.quantity);

    await this.writeWithDerivedPatch({
      writeRef: doc(this.db, paths.stockMovements(this.farmId), id),
      writeData: { ...move, id, farmId: this.farmId },
      patchRef: doc(this.db, paths.inventory(this.farmId), move.itemId),
      derive: (item) => {
        const current = (item.stock as number) ?? 0;
        const next = current + delta;
        // Overdrawing is a data error, not a sync concern — refuse it in both
        // paths. Offline the check runs against the cached stock level.
        if (next < 0) {
          throw new Error(`Only ${current} ${item.unit ?? "units"} of ${item.name} on hand`);
        }
        return { stock: round(next, 2) };
      },
      missing: `Inventory item ${move.itemId} not found`,
    });

    return { ...move, id, farmId: this.farmId } as StockMovement;
  }

  async saveTransaction(
    txn: EventWrite<Omit<Transaction, "id" | "farmId">>,
  ): Promise<Transaction> {
    const id = txn.id ?? doc(this.col(paths.transactions(this.farmId))).id;
    const record = { ...txn, id, farmId: this.farmId } as Transaction;
    await setDoc(doc(this.db, paths.transactions(this.farmId), id), omitUndefined(record));
    await this.autoPost(record);
    return record;
  }

  /**
   * Mirrors a transaction into the general ledger. Keyed on the transaction id
   * so re-saving replaces the entry instead of double-posting. Never throws —
   * a ledger hiccup must not lose the money record the user just entered.
   */
  private async autoPost(txn: Transaction): Promise<void> {
    try {
      const accounts = await this.getAccounts();
      const entry = journalEntryFromTransaction(txn, accounts, journalNumber(txn.date, 0));
      if (!entry) return;
      const ref = doc(this.db, paths.journalEntries(this.farmId), entry.id);
      const existing = await getDoc(ref);
      const number = existing.exists()
        ? (existing.data() as JournalEntry).number
        : journalNumber(txn.date, nextSequence((await this.getJournalEntries()).map((e) => e.number), "JV"));
      await setDoc(ref, omitUndefined({ ...entry, number }), { merge: true });
    } catch {
      // Best-effort: the transaction is already saved.
    }
  }

  /* -------------------------------- Breeding ------------------------------- */

  getBreedingEvents = () =>
    this.all<BreedingEvent>(
      paths.breeding(this.farmId),
      orderBy("date", "desc"),
      fsLimit(ANALYTIC_LIMIT),
    );

  getSemenInventory = () => this.all<SemenStraw>(paths.semen(this.farmId), orderBy("sireName"));

  /* --------------------------------- Health -------------------------------- */

  getHealthEvents = () =>
    this.all<HealthEvent>(
      paths.health(this.farmId),
      orderBy("date", "desc"),
      fsLimit(ANALYTIC_LIMIT),
    );

  /* ---------------------------------- Feed --------------------------------- */

  getFeedItems = () => this.all<FeedItem>(paths.feedItems(this.farmId), orderBy("name"));
  getRations = () => this.all<FeedRation>(paths.rations(this.farmId), orderBy("name"));
  getFeedConsumption = () =>
    this.all<FeedConsumption>(
      paths.feedConsumption(this.farmId),
      orderBy("date", "desc"),
      fsLimit(ANALYTIC_LIMIT),
    );

  /**
   * Logs a feeding and draws its component feeds from stock in one transaction.
   *
   * Kilograms and cost come from the ration, not the client. Feed stock is only
   * decremented for components that actually exist — a ration referencing a feed
   * that's been deleted still logs, it just can't draw down a phantom item.
   */
  async logFeedConsumption(input: FeedConsumptionInput): Promise<FeedConsumption> {
    const id = doc(this.col(paths.feedConsumption(this.farmId))).id;
    const rationRef = doc(this.db, paths.rations(this.farmId), input.rationId);

    // Offline-safe: a worker logs a feeding in the barn with no signal.
    // runTransaction needs a live server round-trip and rejects offline, so we
    // read (cache when offline) then write a batch that queues. Feed logging
    // isn't concurrent enough to need the transaction's atomicity.
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    const read = (ref: ReturnType<typeof doc>) =>
      offline ? getDocFromCache(ref) : getDoc(ref);

    let rationSnap;
    try {
      rationSnap = await read(rationRef);
    } catch {
      throw new Error("Open the feed page once while online — then this works offline.");
    }
    if (!rationSnap.exists()) throw new Error(`Ration ${input.rationId} not found`);
    const ration = rationSnap.data() as FeedRation;
    const components = ration.components ?? [];

    // A component whose feed doc isn't cached offline still logs; it just can't
    // draw down that item's stock until the write path can read it.
    const feedSnaps = await Promise.all(
      components.map((c) =>
        read(doc(this.db, paths.feedItems(this.farmId), c.feedItemId)).catch(() => null),
      ),
    );

    let totalKg = 0;
    let totalCost = 0;
    const batch = writeBatch(this.db);
    feedSnaps.forEach((snap, i) => {
      const kg = round(components[i].kgPerHead * input.heads, 1);
      totalKg += kg;
      if (snap?.exists()) {
        const feed = snap.data() as FeedItem;
        // Ration is kg; stock and cost are per-unit. Convert once, here.
        const perKg = kgPerUnit(feed.unit);
        const unitsDrawn = kg / perKg;
        totalCost += unitsDrawn * (feed.costPerUnit ?? 0);
        batch.update(snap.ref, {
          stock: round(Math.max(0, (feed.stock ?? 0) - unitsDrawn), 2),
        });
      }
    });

    const consumption: FeedConsumption = {
      id,
      farmId: this.farmId,
      date: input.date,
      zoneId: input.zoneId,
      rationId: input.rationId,
      kg: round(totalKg, 1),
      cost: round(totalCost, 2),
      heads: input.heads,
    };
    batch.set(doc(this.db, paths.feedConsumption(this.farmId), id), consumption);
    await trackWrite(batch.commit());
    return consumption;
  }

  /* -------------------------------- Inventory ------------------------------ */

  getInventory = () => this.all<InventoryItem>(paths.inventory(this.farmId), orderBy("name"));
  getStockMovements = () =>
    this.all<StockMovement>(
      paths.stockMovements(this.farmId),
      orderBy("date", "desc"),
      fsLimit(500),
    );

  /* -------------------------------- Employees ------------------------------ */

  getEmployees = () => this.all<Employee>(paths.employees(this.farmId), orderBy("name"));

  async saveEmployee(employee: EventWrite<Omit<Employee, "id" | "farmId">>): Promise<Employee> {
    const id = employee.id ?? doc(this.col(paths.employees(this.farmId))).id;
    const record = { ...employee, id, farmId: this.farmId } as Employee;
    await setDoc(doc(this.db, paths.employees(this.farmId), id), omitUndefined(record));
    return record;
  }

  getAttendance = () =>
    this.all<Attendance>(paths.attendance(this.farmId), orderBy("date", "desc"), fsLimit(2000));

  async recordAttendance(input: AttendanceInput): Promise<Attendance> {
    // One row per employee per day: a deterministic id makes a second clock
    // event correct the first rather than stack a duplicate shift.
    const id = `${input.date}_${input.employeeId}`;
    const record = attendanceFromClock(input, this.farmId, id);
    await setDoc(doc(this.db, paths.attendance(this.farmId), id), omitUndefined(record), {
      merge: true,
    });
    return record;
  }

  /* ---------------------------------- Tasks -------------------------------- */

  getTasks = () =>
    this.all<FarmTask>(paths.tasks(this.farmId), orderBy("dueAt", "desc"), fsLimit(500));

  async updateTask(id: ID, patch: Partial<FarmTask>): Promise<FarmTask> {
    await updateDoc(doc(this.db, paths.tasks(this.farmId), id), patch as DocumentData);
    const snap = await getDoc(doc(this.db, paths.tasks(this.farmId), id));
    return { id: snap.id, ...snap.data() } as FarmTask;
  }

  async saveTask(task: EventWrite<Omit<FarmTask, "id" | "farmId">>): Promise<FarmTask> {
    const id = task.id ?? doc(this.col(paths.tasks(this.farmId))).id;
    const record = { ...task, id, farmId: this.farmId } as FarmTask;
    await setDoc(doc(this.db, paths.tasks(this.farmId), id), omitUndefined(record));
    return record;
  }

  /* --------------------------------- Finance ------------------------------- */

  getTransactions = () =>
    this.all<Transaction>(
      paths.transactions(this.farmId),
      orderBy("date", "desc"),
      fsLimit(ANALYTIC_LIMIT),
    );

  getInvoices = () =>
    this.all<Invoice>(paths.invoices(this.farmId), orderBy("issuedAt", "desc"), fsLimit(500));

  async saveInvoice(invoice: EventWrite<Omit<Invoice, "id" | "farmId">>): Promise<Invoice> {
    const id = invoice.id ?? doc(this.col(paths.invoices(this.farmId))).id;
    const record = { ...invoice, id, farmId: this.farmId } as Invoice;
    await setDoc(doc(this.db, paths.invoices(this.farmId), id), omitUndefined(record));
    await this.postInvoice(record);
    return record;
  }

  /** Books an issued document; a draft stays out of the ledger. */
  private async postInvoice(invoice: Invoice): Promise<void> {
    if (invoice.status === "draft") return;
    try {
      const accounts = await this.getAccounts();
      const kind = invoice.kind ?? "sale";
      const built = journalEntryFromInvoice(
        invoice,
        accounts,
        invoiceDocNumber(
          kind,
          invoice.issuedAt,
          nextSequence((await this.getInvoices()).map((i) => i.number), invoiceSeries(kind)),
        ),
        invoiceTotal(invoice),
      );
      if (!built) return;
      const entryId = `jv_inv_${invoice.id}`;
      await setDoc(
        doc(this.db, paths.journalEntries(this.farmId), entryId),
        omitUndefined({ ...built, id: entryId, farmId: this.farmId }),
        { merge: true },
      );
    } catch {
      // Best-effort: the document itself is already saved.
    }
  }

  async setInvoiceStatus(id: ID, status: Invoice["status"]): Promise<Invoice> {
    await updateDoc(doc(this.db, paths.invoices(this.farmId), id), { status });
    const snap = await getDoc(doc(this.db, paths.invoices(this.farmId), id));
    return { id: snap.id, ...snap.data() } as Invoice;
  }

  /**
   * Records a payment and posts the income in the same batch.
   *
   * The invoice's receivable and the ledger's income are two views of one
   * event; writing them together is what stops the P&L and the outstanding
   * balance from drifting apart. The income category follows the customer —
   * milk buyers book milk sales, animal buyers book animal sales.
   */
  async recordInvoicePayment(input: InvoicePaymentInput): Promise<Invoice> {
    // Reads before the write must survive offline (a buyer paying at the gate
    // with no signal): read from the cache when offline, and let the batch queue
    // rather than blocking on a server ack. The invoice must have been opened
    // once while online for its doc to be cached.
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    const invRef = doc(this.db, paths.invoices(this.farmId), input.invoiceId);
    let snap;
    try {
      snap = offline ? await getDocFromCache(invRef) : await getDoc(invRef);
    } catch {
      throw new Error("Open this invoice once while online — then payments record offline.");
    }
    if (!snap.exists()) throw new Error(`Invoice ${input.invoiceId} not found`);
    const invoice = { id: snap.id, ...snap.data() } as Invoice;

    const total = invoiceTotal(invoice);
    const paidAmount = round(Math.min(total, (invoice.paidAmount ?? 0) + input.amount), 2);
    const status: Invoice["status"] = paidAmount >= total ? "paid" : "partial";

    let partner: Partner | undefined;
    if (invoice.customerId) {
      try {
        const pRef = doc(this.db, paths.partners(this.farmId), invoice.customerId);
        const pSnap = offline ? await getDocFromCache(pRef) : await getDoc(pRef);
        partner = pSnap.data() as Partner | undefined;
      } catch {
        partner = undefined; // uncached offline → income books as "other"
      }
    }
    const category =
      partner?.kind === "animal_buyer"
        ? "animal_sales"
        : partner?.kind === "milk_buyer"
          ? "milk_sales"
          : "other_income";

    const txnId = doc(this.col(paths.transactions(this.farmId))).id;
    const batch = writeBatch(this.db);
    batch.update(invRef, { paidAmount, status });
    batch.set(doc(this.db, paths.transactions(this.farmId), txnId), {
      id: txnId,
      farmId: this.farmId,
      kind: "income",
      category,
      amount: input.amount,
      date: input.date,
      description: `Payment · invoice ${invoice.number}`,
      counterpartyId: invoice.customerId ?? null,
      invoiceId: invoice.id,
      paymentMethod: input.paymentMethod,
    });
    await trackWrite(batch.commit());

    // Revenue was recognised when the invoice posted; settling only moves money
    // and clears the debt, so this must not credit revenue again.
    try {
      const accounts = await this.getAccounts();
      const settled = { ...invoice, paidAmount, status } as Invoice;
      const settlement = journalEntryFromInvoicePayment(
        settled,
        input.amount,
        input.date,
        input.paymentMethod,
        accounts,
        voucherNumber(
          (settled.kind ?? "sale") === "sale" ? "receipt" : "payment",
          input.date,
          nextSequence(
            (await this.getJournalEntries()).map((e) => e.number),
            (settled.kind ?? "sale") === "sale" ? "RV" : "PV",
          ),
        ),
      );
      if (settlement) {
        const entryId = `jv_pay_${invoice.id}_${input.date}_${input.amount}`;
        await setDoc(
          doc(this.db, paths.journalEntries(this.farmId), entryId),
          omitUndefined({ ...settlement, id: entryId, farmId: this.farmId }),
          { merge: true },
        );
      }
    } catch {
      // The payment itself is recorded; a ledger hiccup must not lose it.
    }

    return { ...invoice, paidAmount, status };
  }

  getPartners = () => this.all<Partner>(paths.partners(this.farmId), orderBy("name"));

  /* --------------------------------- Assets -------------------------------- */

  getAssets = () => this.all<Asset>(paths.assets(this.farmId), orderBy("acquiredDate", "desc"));

  async saveAsset(asset: EventWrite<Omit<Asset, "id" | "farmId">>): Promise<Asset> {
    const id = asset.id ?? doc(this.col(paths.assets(this.farmId))).id;
    const record = { ...asset, id, farmId: this.farmId } as Asset;
    await setDoc(doc(this.db, paths.assets(this.farmId), id), omitUndefined(record));
    return record;
  }

  async deleteAsset(id: ID): Promise<void> {
    await deleteDoc(doc(this.db, paths.assets(this.farmId), id));
  }

  /* ------------------------------- Automation ------------------------------- */

  async recordPurchase(input: PurchaseInput): Promise<Transaction> {
    const total = purchaseTotal(input);
    const path = input.kind === "feed" ? paths.feedItems(this.farmId) : paths.inventory(this.farmId);
    const ref = doc(this.db, path, input.itemId);

    // Blend the unit cost and raise stock in one transaction so two people
    // receiving deliveries at once can't clobber each other's numbers.
    const meta = await runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("item-not-found");
      // Feed and inventory docs differ (costPerUnit vs unitCost, and their
      // category enums don't overlap), so read the common shape structurally.
      const item = snap.data() as {
        name: string;
        unit: string;
        stock?: number;
        costPerUnit?: number;
        unitCost?: number;
        category: FeedItem["category"] | InventoryItem["category"];
      };
      const currentCost = input.kind === "feed" ? item.costPerUnit : item.unitCost;
      const blended = blendedUnitCost(item.stock ?? 0, currentCost ?? 0, input.quantity, input.unitCost);
      const nextStock = round((item.stock ?? 0) + input.quantity, 2);
      tx.update(
        ref,
        input.kind === "feed"
          ? { stock: nextStock, costPerUnit: blended }
          : { stock: nextStock, unitCost: blended },
      );
      return {
        name: item.name,
        unit: item.unit,
        category:
          input.kind === "feed"
            ? FEED_EXPENSE_CATEGORY
            : INVENTORY_EXPENSE_CATEGORY[item.category as InventoryItem["category"]],
      };
    });

    const moveId = doc(this.col(paths.stockMovements(this.farmId))).id;
    await setDoc(
      doc(this.db, paths.stockMovements(this.farmId), moveId),
      omitUndefined({
        id: moveId,
        farmId: this.farmId,
        itemId: input.itemId,
        date: input.date,
        kind: "in",
        quantity: input.quantity,
        reference: input.note ?? `Purchase @ ${input.unitCost}/${meta.unit}`,
      }),
    );

    return this.saveTransaction({
      date: input.date,
      kind: "expense",
      category: meta.category,
      amount: total,
      description: `${meta.name} — ${input.quantity} ${meta.unit}`,
      counterpartyId: input.supplierId,
      paymentMethod: input.paymentMethod,
    });
  }

  async recordCost(input: CostInput): Promise<Transaction> {
    return this.saveTransaction({
      date: input.date,
      kind: "expense",
      category: input.category,
      amount: input.amount,
      description: input.description,
      counterpartyId: input.partnerId,
      animalId: input.animalId,
      paymentMethod: input.paymentMethod,
    });
  }

  /* ------------------------------ Organisation ------------------------------ */

  /** Seeds one branch on first read, so postings always have somewhere to land. */
  getBranches = async (): Promise<Branch[]> => {
    const existing = await this.all<Branch>(paths.branches(this.farmId), orderBy("name"));
    if (existing.length > 0) return existing;
    const seeded: Branch = {
      id: "br_main",
      farmId: this.farmId,
      name: "Main farm",
      nameAr: "المزرعة الرئيسية",
      isDefault: true,
      active: true,
    };
    await setDoc(doc(this.db, paths.branches(this.farmId), seeded.id), omitUndefined(seeded));
    return [seeded];
  };

  async saveBranch(branch: EventWrite<Omit<Branch, "id" | "farmId">>): Promise<Branch> {
    const id = branch.id ?? doc(this.col(paths.branches(this.farmId))).id;
    const record = { ...branch, id, farmId: this.farmId } as Branch;
    await setDoc(doc(this.db, paths.branches(this.farmId), id), omitUndefined(record), {
      merge: true,
    });
    return record;
  }

  /** Seeds the farm's own currency as base on first read. */
  getCurrencies = async (): Promise<Currency[]> => {
    const existing = await this.all<Currency>(paths.currencies(this.farmId), orderBy("code"));
    if (existing.length > 0) return existing;
    const farm = await this.getFarm();
    const code = farm.currency || "EGP";
    const seeded: Currency = {
      id: `cur_${code}`,
      farmId: this.farmId,
      code,
      name: code,
      nameAr: code,
      rateToBase: 1,
      isBase: true,
      active: true,
    };
    await setDoc(doc(this.db, paths.currencies(this.farmId), seeded.id), omitUndefined(seeded));
    return [seeded];
  };

  async saveCurrency(currency: EventWrite<Omit<Currency, "id" | "farmId">>): Promise<Currency> {
    if (!isValidRate(currency.rateToBase)) throw new Error("invalid-rate");
    const id = currency.id ?? `cur_${currency.code}`;
    const existing = await getDoc(doc(this.db, paths.currencies(this.farmId), id));
    // The base currency is the yardstick — its rate stays 1 whatever is sent.
    const isBase = existing.exists() ? (existing.data() as Currency).isBase : currency.isBase;
    const record = {
      ...currency,
      id,
      farmId: this.farmId,
      rateToBase: isBase ? 1 : currency.rateToBase,
      updatedAt: new Date().toISOString(),
    } as Currency;
    await setDoc(doc(this.db, paths.currencies(this.farmId), id), omitUndefined(record), {
      merge: true,
    });
    return record;
  }

  /* -------------------------------- Production ------------------------------ */

  getWorkOrders = () =>
    this.all<WorkOrder>(paths.workOrders(this.farmId), orderBy("date", "desc"), fsLimit(500));

  async saveWorkOrder(
    order: EventWrite<Omit<WorkOrder, "id" | "farmId" | "number"> & { number?: string }>,
  ): Promise<WorkOrder> {
    const id = order.id ?? doc(this.col(paths.workOrders(this.farmId))).id;
    if (order.id) {
      const snap = await getDoc(doc(this.db, paths.workOrders(this.farmId), order.id));
      if (snap.exists() && (snap.data() as WorkOrder).status === "done")
        throw new Error("already-completed");
    }
    const record = {
      ...order,
      id,
      farmId: this.farmId,
      number:
        order.number ??
        workOrderNumber(order.date, nextSequence((await this.getWorkOrders()).map((w) => w.number), "WO")),
    } as WorkOrder;
    await setDoc(doc(this.db, paths.workOrders(this.farmId), id), omitUndefined(record), {
      merge: true,
    });
    return record;
  }

  async completeWorkOrder(id: ID): Promise<WorkOrder> {
    const ref = doc(this.db, paths.workOrders(this.farmId), id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("not-found");
    const order = { id, ...snap.data() } as WorkOrder;

    const [inventory, feed] = await Promise.all([this.getInventory(), this.getFeedItems()]);
    const stock = { inventory, feed };
    const check = checkWorkOrder(order, stock);
    if (!check.ok) throw new Error(check.errors[0]);

    // Costed before anything moves — consuming inputs would shift the very
    // unit costs the roll-up is based on.
    const cost = workOrderCost(order, stock);
    const allocated = allocateOutputCosts(order, stock);

    const batch = writeBatch(this.db);

    for (const line of order.inputs) {
      const qty = Math.abs(line.quantity);
      if (line.source === "feed") {
        const f = feed.find((x) => x.id === line.itemId)!;
        batch.update(doc(this.db, paths.feedItems(this.farmId), line.itemId), {
          stock: round(f.stock - qty, 2),
        });
      } else {
        const i = inventory.find((x) => x.id === line.itemId)!;
        batch.update(doc(this.db, paths.inventory(this.farmId), line.itemId), {
          stock: round(i.stock - qty, 2),
        });
      }
      const mvId = `sm_wo_${order.id}_in_${line.itemId}`;
      batch.set(
        doc(this.db, paths.stockMovements(this.farmId), mvId),
        omitUndefined({
          id: mvId,
          farmId: this.farmId,
          itemId: line.itemId,
          date: order.date,
          kind: "out",
          quantity: qty,
          warehouseId: order.warehouseId,
          reference: `${order.number} · ${order.name}`,
        }),
      );
    }

    for (const out of allocated) {
      const qty = Math.abs(out.quantity);
      if (out.source === "feed") {
        const f = feed.find((x) => x.id === out.itemId)!;
        batch.update(doc(this.db, paths.feedItems(this.farmId), out.itemId), {
          stock: round(f.stock + qty, 2),
          costPerUnit: blendedUnitCost(f.stock, f.costPerUnit, qty, out.unitCost),
        });
      } else {
        const i = inventory.find((x) => x.id === out.itemId)!;
        batch.update(doc(this.db, paths.inventory(this.farmId), out.itemId), {
          stock: round(i.stock + qty, 2),
          unitCost: blendedUnitCost(i.stock, i.unitCost, qty, out.unitCost),
        });
      }
      const mvId = `sm_wo_${order.id}_out_${out.itemId}`;
      batch.set(
        doc(this.db, paths.stockMovements(this.farmId), mvId),
        omitUndefined({
          id: mvId,
          farmId: this.farmId,
          itemId: out.itemId,
          date: order.date,
          kind: "in",
          quantity: qty,
          warehouseId: order.warehouseId,
          reference: `${order.number} · ${order.name}`,
        }),
      );
    }

    const patch = {
      status: "done" as const,
      materialCost: cost.materialCost,
      totalCost: cost.totalCost,
      completedAt: new Date().toISOString(),
    };
    batch.update(ref, patch);
    await trackWrite(batch.commit());
    return { ...order, ...patch };
  }

  /* --------------------------- Livestock transfers -------------------------- */

  getLivestockTransfers = () =>
    this.all<LivestockTransfer>(
      paths.livestockTransfers(this.farmId),
      orderBy("date", "desc"),
      fsLimit(500),
    );

  /** Fetch specific animals by id. Firestore caps an `in` filter at 30. */
  private async animalsByIds(ids: ID[]): Promise<Animal[]> {
    const unique = [...new Set(ids)];
    const out: Animal[] = [];
    for (let i = 0; i < unique.length; i += 30) {
      const chunk = unique.slice(i, i + 30);
      const snap = await getDocs(
        query(this.col(paths.animals(this.farmId)), where(documentId(), "in", chunk)),
      );
      out.push(...rows<Animal>(snap));
    }
    return out;
  }

  /** Live head count in a pen, without reading the animals themselves. */
  private async countAnimalsInZone(zoneId: ID): Promise<number> {
    const snap = await getCountFromServer(
      query(
        this.col(paths.animals(this.farmId)),
        where("penId", "==", zoneId),
        where("status", "in", ["active", "quarantine"]),
      ),
    );
    return snap.data().count;
  }

  async recordLivestockTransfer(input: LivestockTransferInput): Promise<LivestockTransfer> {
    // Read only the animals being moved, plus a count of the destination —
    // loading the whole herd to move three head would be tens of thousands of
    // document reads on a large farm.
    const [animals, zones, existing, occupancyBefore] = await Promise.all([
      this.animalsByIds(input.animalIds),
      this.getZones(),
      this.getLivestockTransfers(),
      this.countAnimalsInZone(input.toZoneId),
    ]);

    const check = checkTransfer(input, animals, zones, occupancyBefore);
    if (!check.ok) throw new Error(check.errors[0]);

    const id = doc(this.col(paths.livestockTransfers(this.farmId))).id;
    const transfer: LivestockTransfer = {
      id,
      farmId: this.farmId,
      number: transferNumber(input.date, nextSequence(existing.map((t) => t.number), "LT")),
      date: input.date,
      fromZoneId: commonOrigin(input.animalIds, animals),
      toZoneId: input.toZoneId,
      animalIds: [...input.animalIds],
      reason: input.reason,
      notes: input.notes,
      createdAt: new Date().toISOString(),
    };

    // One batch, so the document and every animal's pen land together.
    const batch = writeBatch(this.db);
    batch.set(
      doc(this.db, paths.livestockTransfers(this.farmId), id),
      omitUndefined(transfer),
    );
    for (const animalId of input.animalIds) {
      batch.update(doc(this.db, paths.animals(this.farmId), animalId), {
        penId: input.toZoneId,
      });
    }
    await trackWrite(batch.commit());
    return transfer;
  }

  /* ---------------------------------- Stores -------------------------------- */

  /** Seeds a default store on first read so stock always has somewhere to be. */
  getWarehouses = async (): Promise<Warehouse[]> => {
    const existing = await this.all<Warehouse>(paths.warehouses(this.farmId), orderBy("name"));
    if (existing.length > 0) return existing;
    const seeded: Warehouse[] = [
      {
        id: DEFAULT_WAREHOUSE_ID,
        farmId: this.farmId,
        name: "Main store",
        nameAr: "المخزن الرئيسي",
        isDefault: true,
        active: true,
      },
    ];
    await setDoc(
      doc(this.db, paths.warehouses(this.farmId), DEFAULT_WAREHOUSE_ID),
      omitUndefined(seeded[0]),
    );
    return seeded;
  };

  async saveWarehouse(warehouse: EventWrite<Omit<Warehouse, "id" | "farmId">>): Promise<Warehouse> {
    const id = warehouse.id ?? doc(this.col(paths.warehouses(this.farmId))).id;
    const record = { ...warehouse, id, farmId: this.farmId } as Warehouse;
    await setDoc(doc(this.db, paths.warehouses(this.farmId), id), omitUndefined(record), {
      merge: true,
    });
    return record;
  }

  async transferStock(input: StockTransferInput): Promise<StockMovement[]> {
    if (input.fromWarehouseId === input.toWarehouseId) throw new Error("same-store");
    const qty = Math.abs(input.quantity);
    if (qty === 0) throw new Error("zero-quantity");

    const [items, movements] = await Promise.all([this.getInventory(), this.getStockMovements()]);
    const item = items.find((i) => i.id === input.itemId);
    if (!item) throw new Error("item-not-found");
    // Only a per-store check can catch this: the farm-wide total is unchanged.
    if (qty > stockInWarehouse(item, input.fromWarehouseId, movements))
      throw new Error("insufficient-in-store");

    const transferId = doc(this.col(paths.stockMovements(this.farmId))).id;
    const base = {
      farmId: this.farmId,
      itemId: input.itemId,
      date: input.date,
      quantity: qty,
      transferId,
      reference: input.reference ?? "Transfer",
    };
    const out = { ...base, id: `${transferId}_out`, kind: "out" as const, warehouseId: input.fromWarehouseId };
    const into = { ...base, id: `${transferId}_in`, kind: "in" as const, warehouseId: input.toWarehouseId };

    // Batched, and deliberately not through saveStockMovement: the pair nets to
    // zero so the item's total must not move.
    const batch = writeBatch(this.db);
    batch.set(doc(this.db, paths.stockMovements(this.farmId), out.id), omitUndefined(out));
    batch.set(doc(this.db, paths.stockMovements(this.farmId), into.id), omitUndefined(into));
    await trackWrite(batch.commit());
    return [out, into];
  }

  async recordStocktake(input: StocktakeInput): Promise<StockMovement[]> {
    const [items, movements] = await Promise.all([this.getInventory(), this.getStockMovements()]);
    const written: StockMovement[] = [];

    for (const line of input.lines) {
      const item = items.find((i) => i.id === line.itemId);
      if (!item) continue;
      const expected = stockInWarehouse(item, input.warehouseId, movements);
      const [variance] = stocktakeVariance([
        { itemId: line.itemId, expected, counted: line.counted },
      ]);
      if (variance.variance === 0) continue;

      written.push(
        await this.saveStockMovement({
          itemId: line.itemId,
          date: input.date,
          kind: "adjustment",
          quantity: variance.variance,
          warehouseId: input.warehouseId,
          countedQty: line.counted,
          reference: input.reference ?? "Stocktake",
        }),
      );
    }
    return written;
  }

  /* --------------------------------- Cheques -------------------------------- */

  getCheques = () => this.all<Cheque>(paths.cheques(this.farmId), orderBy("dueDate"));

  /** Builds and writes the entry for one stage of a cheque's life. */
  private async postCheque(
    cheque: Cheque,
    phase: ChequePhase,
    opts: { treasuryAccountId?: ID; date?: string } = {},
  ): Promise<ID | null> {
    const accounts = await this.getAccounts();
    const seq = nextSequence(
      (await this.getJournalEntries()).map((e) => e.number),
      cheque.kind === "receivable" ? "CR" : "CP",
    );
    const built = journalEntryFromCheque(
      cheque,
      phase,
      accounts,
      chequeNumber(cheque.kind, opts.date ?? cheque.dueDate, seq),
      opts,
    );
    if (!built) return null;
    const id = `jv_chq_${cheque.id}_${phase}`;
    await setDoc(
      doc(this.db, paths.journalEntries(this.farmId), id),
      omitUndefined({ ...built, id, farmId: this.farmId }),
      { merge: true },
    );
    return id;
  }

  async saveCheque(cheque: EventWrite<Omit<Cheque, "id" | "farmId">>): Promise<Cheque> {
    const id = cheque.id ?? doc(this.col(paths.cheques(this.farmId))).id;
    const isNew = !cheque.id;
    const record = {
      ...cheque,
      id,
      farmId: this.farmId,
      createdAt: cheque.createdAt ?? new Date().toISOString(),
    } as Cheque;

    if (isNew) {
      const entryId = await this.postCheque(record, "received");
      if (entryId) record.entryIds = [entryId];
    }
    await setDoc(doc(this.db, paths.cheques(this.farmId), id), omitUndefined(record), {
      merge: true,
    });
    return record;
  }

  async setChequeStatus(
    id: ID,
    status: ChequeStatus,
    opts: { treasuryAccountId?: ID; date?: string } = {},
  ): Promise<Cheque> {
    const ref = doc(this.db, paths.cheques(this.farmId), id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("not-found");
    const cheque = { id, ...snap.data() } as Cheque;
    if (cheque.status !== "held") throw new Error("already-settled");

    let entryId: ID | null = null;
    if (status === "collected") entryId = await this.postCheque(cheque, "settled", opts);
    else if (status === "bounced" || status === "cancelled")
      entryId = await this.postCheque(cheque, "bounced", opts);

    const patch = {
      status,
      settledAt: opts.date ?? new Date().toISOString().slice(0, 10),
      entryIds: [...(cheque.entryIds ?? []), ...(entryId ? [entryId] : [])],
    };
    await setDoc(ref, omitUndefined(patch), { merge: true });
    return { ...cheque, ...patch };
  }

  /* ------------------------------- Accounting ------------------------------- */

  /**
   * The chart of accounts. A farm that has never opened the books gets the
   * default tree written on first read, so accounting is usable immediately
   * rather than starting from an empty screen.
   */
  getAccounts = async (): Promise<Account[]> => {
    const existing = await this.all<Account>(paths.accounts(this.farmId), orderBy("code"));
    if (existing.length > 0) return existing;

    const seeded = defaultChartOfAccounts(this.farmId);
    const batch = writeBatch(this.db);
    for (const account of seeded) {
      batch.set(doc(this.db, paths.accounts(this.farmId), account.id), omitUndefined(account));
    }
    await batch.commit();
    return seeded;
  };

  async saveAccount(account: EventWrite<Omit<Account, "id" | "farmId">>): Promise<Account> {
    const id = account.id ?? doc(this.col(paths.accounts(this.farmId))).id;
    const record = { ...account, id, farmId: this.farmId } as Account;
    await setDoc(doc(this.db, paths.accounts(this.farmId), id), omitUndefined(record), {
      merge: true,
    });
    return record;
  }

  async deleteAccount(id: ID): Promise<void> {
    const [accounts, entries] = await Promise.all([this.getAccounts(), this.getJournalEntries()]);
    const account = accounts.find((a) => a.id === id);
    if (!account) return;
    // The same three guards as the demo adapter — an account the books depend
    // on must not vanish.
    if (account.systemKey) throw new Error("system-account");
    if (accounts.some((a) => a.parentId === id)) throw new Error("has-children");
    if (entries.some((e) => e.lines.some((l) => l.accountId === id)))
      throw new Error("has-postings");
    await deleteDoc(doc(this.db, paths.accounts(this.farmId), id));
  }

  /**
   * The ledger.
   *
   * Every balance on the accounting screen is computed from this list, so the
   * bound is a correctness concern, not just a performance one: drop entries
   * and the trial balance still *balances* (each entry is internally balanced)
   * while being materially wrong. The UI checks for truncation via
   * `LEDGER_READ_LIMIT` and refuses to claim the books are correct when hit.
   */
  getJournalEntries = () =>
    this.all<JournalEntry>(
      paths.journalEntries(this.farmId),
      orderBy("date", "desc"),
      fsLimit(LEDGER_READ_LIMIT),
    );

  private async assertYearOpen(fiscalYearId?: ID): Promise<void> {
    if (!fiscalYearId) return;
    const years = await this.getFiscalYears();
    const year = years.find((y) => y.id === fiscalYearId);
    if (year && year.status === "closed") throw new Error("year-closed");
  }

  async saveJournalEntry(
    entry: EventWrite<Omit<JournalEntry, "id" | "farmId" | "number"> & { number?: string }>,
  ): Promise<JournalEntry> {
    if (!isBalanced(entry.lines)) throw new Error("unbalanced");
    await this.assertYearOpen(entry.fiscalYearId);

    if (entry.id) {
      const snap = await getDoc(doc(this.db, paths.journalEntries(this.farmId), entry.id));
      if (snap.exists() && (snap.data() as JournalEntry).status === "posted")
        throw new Error("posted-immutable");
    }

    const id = entry.id ?? doc(this.col(paths.journalEntries(this.farmId))).id;
    const number =
      entry.number ??
      journalNumber(entry.date, nextSequence((await this.getJournalEntries()).map((e) => e.number), "JV"));
    const record = {
      ...entry,
      id,
      farmId: this.farmId,
      number,
      createdAt: entry.createdAt ?? new Date().toISOString(),
    } as JournalEntry;
    await setDoc(
      doc(this.db, paths.journalEntries(this.farmId), id),
      omitUndefined(record),
      { merge: true },
    );
    return record;
  }

  async setJournalStatus(id: ID, status: JournalEntry["status"]): Promise<JournalEntry> {
    const ref = doc(this.db, paths.journalEntries(this.farmId), id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("not-found");
    const entry = snap.data() as JournalEntry;
    await this.assertYearOpen(entry.fiscalYearId);
    if (status === "posted" && !isBalanced(entry.lines)) throw new Error("unbalanced");
    const patch: Partial<JournalEntry> = { status };
    if (status === "posted") patch.postedAt = new Date().toISOString();
    await setDoc(ref, omitUndefined(patch), { merge: true });
    return { ...entry, ...patch };
  }

  getFiscalYears = () =>
    this.all<FiscalYear>(paths.fiscalYears(this.farmId), orderBy("startDate", "desc"));

  async saveFiscalYear(year: EventWrite<Omit<FiscalYear, "id" | "farmId">>): Promise<FiscalYear> {
    const id = year.id ?? doc(this.col(paths.fiscalYears(this.farmId))).id;
    const record = { ...year, id, farmId: this.farmId } as FiscalYear;
    await setDoc(doc(this.db, paths.fiscalYears(this.farmId), id), omitUndefined(record), {
      merge: true,
    });
    return record;
  }

  async closeFiscalYear(id: ID): Promise<FiscalYear> {
    const ref = doc(this.db, paths.fiscalYears(this.farmId), id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("not-found");
    const patch = { status: "closed" as const, closedAt: new Date().toISOString() };
    await setDoc(ref, patch, { merge: true });
    return { ...(snap.data() as FiscalYear), ...patch };
  }

  /* --------------------------------- Alerts -------------------------------- */

  getAlerts = async (): Promise<Alert[]> => {
    const raw = await this.all<Record<string, unknown>>(
      paths.alerts(this.farmId),
      orderBy("createdAt", "desc"),
      fsLimit(200),
    );
    return raw.map(normalizeAlert);
  };

  async markAlertRead(id: ID): Promise<void> {
    await updateDoc(doc(this.db, paths.alerts(this.farmId), id), { read: true });
  }

  /* -------------------------------- Telemetry ------------------------------ */

  async getWeather(): Promise<WeatherNow> {
    const snap = await getDoc(doc(this.db, paths.telemetry(this.farmId), "weather"));
    if (!snap.exists()) throw new Error("No weather document. The weather sync job hasn't run.");
    return snap.data() as WeatherNow;
  }

  getUtilities = () =>
    this.all<UtilityReading>(paths.utilities(this.farmId), orderBy("date", "asc"), fsLimit(400));
}

/** Lets the milk form call `recordMilkSession` without importing Firestore. */
export function isFirebaseRepository(repo: FarmRepository): repo is FirebaseFarmRepository {
  return repo.source === "firebase";
}
