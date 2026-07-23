/**
 * In-memory adapter over the deterministic dataset.
 *
 * Deliberately async and paginated: every call has the same shape the Firestore
 * adapter will have, so switching backends never changes a component.
 */

import { getDataset, TODAY, woodsCurve, woodsShape, seasonalFactor } from "@/core/data/seed";
import { addDays, diffDays, rangeDays } from "@/lib/date";
import { mulberry32, round, clamp, sum } from "@/lib/utils";
import { isBalanced } from "@/core/services/accounting";
import {
  chequeNumber,
  journalEntryFromCheque,
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
import {
  applyBreedingEvent,
  applyHealthEvent,
  attendanceFromClock,
  kgPerUnit,
} from "@/core/domain/rules";
import type {
  Account,
  Cheque,
  ChequeStatus,
  Animal,
  AnimalDisposal,
  Asset,
  Attendance,
  BreedingEvent,
  Employee,
  FarmTask,
  FeedConsumption,
  FiscalYear,
  HealthEvent,
  ID,
  Invoice,
  JournalEntry,
  Member,
  MilkRecord,
  PendingInvite,
  Role,
  StockMovement,
  TimelineEntry,
  Transaction,
} from "@/core/domain/types";
import type {
  AnimalQuery,
  AttendanceInput,
  EventWrite,
  FarmRepository,
  FeedConsumptionInput,
  InvoicePaymentInput,
  MilkSessionInput,
  Page,
  WriteOutcome,
} from "./farm-repository";
import { invoiceTotal } from "./farm-repository";

/**
 * Simulates network latency just enough that skeletons are exercised, and hands
 * back a fresh array each call.
 *
 * The copy is load-bearing, not hygiene. Writes mutate the in-memory dataset in
 * place, so returning `this.db.health` directly gives React Query a reference
 * identical to the one it already holds — structural sharing then concludes
 * nothing changed and skips the re-render. The mutation succeeds, the toast
 * fires, and the screen silently keeps showing stale data.
 *
 * A real backend returns fresh objects on every read, so this only restores the
 * behaviour the Firestore adapter already has.
 */
const tick = <T,>(value: T): Promise<T> =>
  new Promise((resolve) =>
    setTimeout(() => resolve(Array.isArray(value) ? ([...value] as T) : value), 0),
  );

function ageDaysOf(a: Animal) {
  return diffDays(TODAY, a.dateOfBirth);
}

export function daysInMilk(a: Animal): number {
  return a.milkStatus === "lactating" && a.lastCalvingDate
    ? diffDays(TODAY, a.lastCalvingDate)
    : 0;
}

/** Inverse of the lactation model — peak litres implied by today's yield. */
export function peakFromCurrent(currentL: number, dim: number) {
  const shape = woodsShape(dim) * seasonalFactor(TODAY);
  return currentL > 0 && shape > 0 ? currentL / shape : 10;
}

/** Rebuilds a plausible per-animal daily record from the animal's own seed. */
export function animalMilkSeries(a: Animal, days: number): MilkRecord[] {
  if (a.milkStatus !== "lactating") return [];
  const dim = daysInMilk(a);
  // Recover the animal's peak from its current average: today's yield is
  // peak × curve-position × season.
  const peak = peakFromCurrent(a.avgDailyMilkL, dim);
  const seedNum = Number(a.id.replace(/\D/g, "")) || 1;
  const out: MilkRecord[] = [];

  rangeDays(TODAY, days).forEach((date, i) => {
    const t = dim - (days - 1 - i);
    if (t <= 0) return;
    const r = mulberry32(seedNum * 977 + i * 31);
    const base = woodsCurve(t, peak) * seasonalFactor(date);
    const daily = Math.max(0, base * (1 + ((r() + r()) / 2 - 0.5) * 0.18));
    const morning = daily * (0.54 + r() * 0.04);
    const scc = Math.round(90_000 + r() * (a.healthScore < 70 ? 900_000 : 240_000));
    (["morning", "evening"] as const).forEach((session) => {
      const volumeL = round(session === "morning" ? morning : daily - morning, 2);
      out.push({
        id: `mr_${a.id}_${date}_${session}`,
        farmId: a.farmId,
        animalId: a.id,
        date,
        session,
        volumeL,
        fatPct: round(6.2 + r() * 1.6, 2),
        proteinPct: round(3.8 + r() * 0.8, 2),
        somaticCellCount: scc,
        temperatureC: round(3.4 + r() * 1.4, 1),
        rejectedL: scc > 700_000 && r() > 0.7 ? round(volumeL, 2) : 0,
        rejectionReason: scc > 700_000 ? "high_scc" : undefined,
        machineId: `MP-${1 + (seedNum % 8)}`,
      });
    });
  });
  return out;
}

export function animalWeightSeries(a: Animal) {
  const seedNum = Number(a.id.replace(/\D/g, "")) || 1;
  const r = mulberry32(seedNum * 613);
  const points: { date: string; weightKg: number }[] = [];
  const months = a.isCalf ? 10 : 18;
  for (let i = months; i >= 0; i--) {
    const date = addDays(TODAY, -i * 30);
    if (diffDays(date, a.dateOfBirth) < 0) continue;
    const growth = a.isCalf ? 1 - i * 0.075 : 1 - i * 0.006;
    points.push({
      date,
      weightKg: Math.round(clamp(a.weightKg * growth * (1 + (r() - 0.5) * 0.03), 25, 1200)),
    });
  }
  return points;
}

export class DemoFarmRepository implements FarmRepository {
  readonly source = "demo" as const;
  private db = getDataset();

  getFarm = () => tick(this.db.farm);
  getZones = () => tick(this.db.zones);

  /* ---------------------------------- Team --------------------------------- */
  // The demo has no auth, so members are illustrative — enough to exercise the
  // Team screen. Changes are in-memory and reset on refresh, like everything
  // else in the sandbox.
  private members: Member[] = [
    { id: "demo", farmId: "farm_nile_delta", email: "owner@niledelta.farm", name: "Tarek Badr", role: "owner", permissions: ["*"] },
    { id: "m_2", farmId: "farm_nile_delta", email: "hana.saleh@niledelta.farm", name: "Hana Saleh", role: "manager" },
    { id: "m_3", farmId: "farm_nile_delta", email: "vet@niledelta.farm", name: "Dr. Omar Fathy", role: "veterinarian" },
    { id: "m_4", farmId: "farm_nile_delta", email: "accounts@niledelta.farm", name: "Nour Adel", role: "accountant" },
  ];
  private invites: PendingInvite[] = [
    { email: "new.milker@niledelta.farm", role: "worker", invitedAt: TODAY },
  ];

  getMembers = () => tick(this.members);
  getPendingInvites = () => tick(this.invites);

  async inviteMember(email: string, role: Role) {
    const key = email.trim().toLowerCase();
    const invite: PendingInvite = { email: key, role, invitedAt: TODAY };
    const idx = this.invites.findIndex((i) => i.email === key);
    if (idx >= 0) this.invites[idx] = invite;
    else this.invites.unshift(invite);
    return tick(invite);
  }

  async setMemberRole(uid: ID, role: Role) {
    const m = this.members.find((x) => x.id === uid);
    if (m) {
      m.role = role;
      m.permissions = role === "owner" ? ["*"] : [];
    }
    return tick(undefined);
  }

  async removeMember(uid: ID) {
    this.members = this.members.filter((m) => m.id !== uid);
    return tick(undefined);
  }

  async revokeInvite(email: string) {
    const key = email.trim().toLowerCase();
    this.invites = this.invites.filter((i) => i.email !== key);
    return tick(undefined);
  }

  async listAnimals(query: AnimalQuery = {}): Promise<Page<Animal>> {
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
    } = query;

    const q = search.trim().toLowerCase();
    let items = this.db.animals.filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (milkStatus !== "all" && a.milkStatus !== milkStatus) return false;
      if (reproStatus !== "all" && a.reproStatus !== reproStatus) return false;
      if (penId !== "all" && a.penId !== penId) return false;
      if (breed !== "all" && a.breed !== breed) return false;
      if (sex !== "all" && a.sex !== sex) return false;
      if (group === "calves" && !a.isCalf) return false;
      if (group === "adults" && (a.isCalf || a.sex === "male")) return false;
      if (group === "bulls" && !(a.sex === "male" && !a.isCalf)) return false;
      if (q) {
        const hay = `${a.tag} ${a.name} ${a.nameAr} ${a.rfid} ${a.bloodline ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    items = [...items].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "milk":
          return (a.avgDailyMilkL - b.avgDailyMilkL) * dir;
        case "age":
          return (ageDaysOf(a) - ageDaysOf(b)) * dir;
        case "weight":
          return (a.weightKg - b.weightKg) * dir;
        case "health":
          return (a.healthScore - b.healthScore) * dir;
        default:
          return a.tag.localeCompare(b.tag) * dir;
      }
    });

    const start = (page - 1) * pageSize;
    return tick({
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      pageSize,
    });
  }

  getAnimal = (id: ID) => tick(this.db.animals.find((a) => a.id === id) ?? null);

  async getAnimalTimeline(id: ID): Promise<TimelineEntry[]> {
    const animal = this.db.animals.find((a) => a.id === id);
    if (!animal) return [];
    const entries: TimelineEntry[] = [];

    entries.push({
      id: `tl_birth_${id}`,
      date: animal.dateOfBirth,
      kind: "birth",
      title: animal.acquiredFrom === "purchased" ? "Purchased and registered" : "Born on farm",
      titleAr: animal.acquiredFrom === "purchased" ? "تم الشراء والتسجيل" : "ولدت في المزرعة",
      detail: `Tag ${animal.tag} · ${animal.breed.replace(/_/g, " ")}`,
      detailAr: `رقم ${animal.tag}`,
    });

    this.db.health
      .filter((h) => h.animalId === id)
      .forEach((h) =>
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

    this.db.breeding
      .filter((b) => b.animalId === id)
      .forEach((b) =>
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
          titleAr:
            b.type === "calving" ? "ولادة" : b.type === "ai" ? "تلقيح صناعي" : "حدث تناسلي",
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

    return tick(entries.sort((a, b) => b.date.localeCompare(a.date)));
  }

  async getAnimalMilkHistory(id: ID, days = 120) {
    const a = this.db.animals.find((x) => x.id === id);
    return tick(a ? this.withOverrides(animalMilkSeries(a, days)) : []);
  }

  async getAnimalWeightHistory(id: ID) {
    const a = this.db.animals.find((x) => x.id === id);
    return tick(a ? animalWeightSeries(a) : []);
  }

  async saveAnimal(patch: Partial<Animal> & { id?: ID }) {
    const idx = this.db.animals.findIndex((a) => a.id === patch.id);
    if (idx >= 0) {
      this.db.animals[idx] = { ...this.db.animals[idx], ...patch };
      this.syncLivestockAsset(this.db.animals[idx]);
      return tick(this.db.animals[idx]);
    }
    const created = {
      ...(patch as Animal),
      id: patch.id ?? `an_${Date.now()}`,
    };
    this.db.animals.unshift(created);
    this.syncLivestockAsset(created);
    return tick(created);
  }

  /**
   * An animal bought for money is capital, not an expense — mirror its purchase
   * price into the asset register instead of the expense list.
   */
  private syncLivestockAsset(animal: Animal) {
    const asset = livestockAssetFor(animal);
    if (!asset) return;
    const record = { ...asset, farmId: this.db.farm.id } as Asset;
    const idx = this.db.assets.findIndex((a) => a.id === record.id);
    if (idx >= 0) this.db.assets[idx] = { ...this.db.assets[idx], ...record };
    else this.db.assets.unshift(record);
  }

  async disposeAnimal(id: ID, disposal: AnimalDisposal) {
    const idx = this.db.animals.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("Animal not found");
    const status: Animal["status"] =
      disposal.type === "sold" ? "sold" : disposal.type === "culled" ? "culled" : "dead";
    this.db.animals[idx] = { ...this.db.animals[idx], status, disposal };
    if (disposal.type === "sold" && (disposal.proceeds ?? 0) > 0) {
      this.db.transactions.unshift({
        id: `tx_${Date.now()}`,
        farmId: this.db.farm.id,
        date: disposal.date,
        kind: "income",
        category: "animal_sales",
        amount: disposal.proceeds!,
        description: `Sale of ${this.db.animals[idx].tag}`,
        animalId: id,
        counterpartyId: disposal.buyerId,
        paymentMethod: "cash",
      } as Transaction);
    }
    return tick(this.db.animals[idx]);
  }

  getMilkDaily = (days = 730) => tick(this.db.milkDaily.slice(-days));

  async getMilkRecords(date: string) {
    const lactating = this.db.animals.filter((a) => a.milkStatus === "lactating");
    const offset = diffDays(TODAY, date);
    const records = lactating.flatMap((a) => {
      const series = animalMilkSeries(a, Math.max(1, offset + 1));
      return series.filter((r) => r.date === date);
    });
    return tick(this.withOverrides(records));
  }

  /**
   * The demo generates milk records from each animal's seed rather than storing
   * them, so a recorded session can't be "saved" anywhere. Overrides shadow the
   * generated value for the same id, which makes a write visible everywhere it
   * should be without materialising 150,000 synthetic rows up front.
   */
  private milkOverrides = new Map<string, MilkRecord>();

  private withOverrides(records: MilkRecord[]): MilkRecord[] {
    if (!this.milkOverrides.size) return records;
    const seen = new Set(records.map((r) => r.id));
    return [
      ...records.map((r) => this.milkOverrides.get(r.id) ?? r),
      // Sessions recorded for animals the generator produced nothing for.
      ...[...this.milkOverrides.values()].filter((r) => !seen.has(r.id)),
    ];
  }

  getBreedingEvents = () => tick(this.db.breeding);
  getSemenInventory = () => tick(this.db.semen);
  getHealthEvents = () => tick(this.db.health);
  getFeedItems = () => tick(this.db.feedItems);
  getRations = () => tick(this.db.rations);
  getFeedConsumption = () => tick(this.db.feedConsumption);
  getInventory = () => tick(this.db.inventory);
  getStockMovements = () => tick(this.db.movements);
  getEmployees = () => tick(this.db.employees);

  async saveEmployee(employee: EventWrite<Omit<Employee, "id" | "farmId">>) {
    const idx = employee.id ? this.db.employees.findIndex((e) => e.id === employee.id) : -1;
    if (idx >= 0) {
      this.db.employees[idx] = { ...this.db.employees[idx], ...employee } as Employee;
      return tick(this.db.employees[idx]);
    }
    const created = {
      ...employee,
      id: employee.id ?? `emp_${Date.now()}`,
      farmId: this.db.farm.id,
    } as Employee;
    this.db.employees.unshift(created);
    return tick(created);
  }

  getAttendance = () => tick(this.db.attendance);

  async recordAttendance(input: AttendanceInput) {
    const id = `${input.date}_${input.employeeId}`;
    const record = attendanceFromClock(input, this.db.farm.id, id) as Attendance;
    const idx = this.db.attendance.findIndex((a) => a.id === id);
    if (idx >= 0) this.db.attendance[idx] = record;
    else this.db.attendance.unshift(record);
    return tick(record);
  }

  getTasks = () => tick(this.db.tasks);

  async logFeedConsumption(input: FeedConsumptionInput) {
    const ration = this.db.rations.find((r) => r.id === input.rationId);
    if (!ration) throw new Error(`Ration ${input.rationId} not found`);

    let totalKg = 0;
    let totalCost = 0;
    for (const c of ration.components ?? []) {
      const kg = round(c.kgPerHead * input.heads, 1);
      totalKg += kg;
      const feed = this.db.feedItems.find((f) => f.id === c.feedItemId);
      if (feed) {
        // Ration is kg; stock and cost are per-unit (a ton, a bale).
        const unitsDrawn = kg / kgPerUnit(feed.unit);
        totalCost += unitsDrawn * (feed.costPerUnit ?? 0);
        feed.stock = round(Math.max(0, feed.stock - unitsDrawn), 2);
      }
    }

    const record: FeedConsumption = {
      id: `fc_${Date.now()}`,
      farmId: this.db.farm.id,
      date: input.date,
      zoneId: input.zoneId,
      rationId: input.rationId,
      kg: round(totalKg, 1),
      cost: round(totalCost, 2),
      heads: input.heads,
    };
    this.db.feedConsumption.unshift(record);
    return tick(record);
  }

  async updateTask(id: ID, patch: Partial<FarmTask>) {
    const idx = this.db.tasks.findIndex((t) => t.id === id);
    this.db.tasks[idx] = { ...this.db.tasks[idx], ...patch };
    return tick(this.db.tasks[idx]);
  }

  async saveTask(task: EventWrite<Omit<FarmTask, "id" | "farmId">>) {
    const idx = task.id ? this.db.tasks.findIndex((t) => t.id === task.id) : -1;
    if (idx >= 0) {
      this.db.tasks[idx] = { ...this.db.tasks[idx], ...task } as FarmTask;
      return tick(this.db.tasks[idx]);
    }
    const created = {
      ...task,
      id: task.id ?? `task_${Date.now()}`,
      farmId: this.db.farm.id,
    } as FarmTask;
    this.db.tasks.unshift(created);
    return tick(created);
  }

  /* ---------------------------- Event writes ------------------------------- */
  // In-memory and non-durable: a refresh restores the seeded state. That's the
  // point — the demo is a sandbox people can break safely. The logic is the
  // same domain-rules code the Firestore adapter runs, so testing a workflow
  // here tells you what it will do for real.

  async saveHealthEvent(event: EventWrite<Omit<HealthEvent, "id" | "farmId">>) {
    const saved = {
      ...event,
      id: event.id ?? `he_${Date.now()}`,
      farmId: this.db.farm.id,
    } as HealthEvent;

    this.db.health.unshift(saved);

    const idx = this.db.animals.findIndex((a) => a.id === event.animalId);
    if (idx >= 0) {
      const animal = this.db.animals[idx];
      this.db.animals[idx] = {
        ...animal,
        ...applyHealthEvent(animal, event),
        ...(event.withdrawalUntil &&
        (!animal.withdrawalUntil || event.withdrawalUntil > animal.withdrawalUntil)
          ? { withdrawalUntil: event.withdrawalUntil }
          : {}),
      };
    }

    return tick(saved);
  }

  async saveBreedingEvent(event: EventWrite<Omit<BreedingEvent, "id" | "farmId">>) {
    const saved = {
      ...event,
      id: event.id ?? `be_${Date.now()}`,
      farmId: this.db.farm.id,
    } as BreedingEvent;

    this.db.breeding.unshift(saved);

    const idx = this.db.animals.findIndex((a) => a.id === event.animalId);
    if (idx >= 0) {
      const animal = this.db.animals[idx];
      this.db.animals[idx] = { ...animal, ...applyBreedingEvent(animal, event) };
    }

    return tick(saved);
  }

  async saveStockMovement(move: EventWrite<Omit<StockMovement, "id" | "farmId">>) {
    const saved = {
      ...move,
      id: move.id ?? `sm_${Date.now()}`,
      farmId: this.db.farm.id,
    } as StockMovement;

    const delta =
      move.kind === "in"
        ? Math.abs(move.quantity)
        : move.kind === "adjustment"
          ? move.quantity
          : -Math.abs(move.quantity);

    const item = this.db.inventory.find((i) => i.id === move.itemId);
    if (item) {
      if (item.stock + delta < 0) {
        throw new Error(`Only ${item.stock} ${item.unit} of ${item.name} on hand`);
      }
      item.stock = round(item.stock + delta, 2);
    }

    this.db.movements.unshift(saved);
    return tick(saved);
  }

  async saveTransaction(txn: EventWrite<Omit<Transaction, "id" | "farmId">>) {
    const saved = {
      ...txn,
      id: txn.id ?? `tx_${Date.now()}`,
      farmId: this.db.farm.id,
    } as Transaction;
    this.db.transactions.unshift(saved);
    this.autoPost(saved);
    return tick(saved);
  }

  /**
   * Mirrors a transaction into the general ledger so the books never have to be
   * kept by hand. Re-saving the same transaction replaces its entry rather than
   * double-posting.
   */
  private autoPost(txn: Transaction) {
    const entry = journalEntryFromTransaction(
      txn,
      this.db.accounts,
      journalNumber(txn.date, this.db.journalEntries.length + 1),
    );
    if (!entry) return; // chart is missing an account — leave the books untouched
    const idx = this.db.journalEntries.findIndex((e) => e.sourceId === txn.id);
    if (idx >= 0) this.db.journalEntries[idx] = entry;
    else this.db.journalEntries.unshift(entry);
  }

  async recordMilkSession(input: MilkSessionInput): Promise<WriteOutcome> {
    const { date, session, entries } = input;

    for (const entry of entries) {
      const id = `${date}_${entry.animalId}_${session}`;
      this.milkOverrides.set(id, {
        id,
        farmId: this.db.farm.id,
        animalId: entry.animalId,
        date,
        session,
        volumeL: entry.volumeL,
        rejectedL: entry.rejectedL ?? 0,
        fatPct: input.fatPct ?? 0,
        proteinPct: input.proteinPct ?? 0,
        somaticCellCount: input.somaticCellCount ?? 0,
        temperatureC: input.temperatureC ?? 0,
        workerId: input.workerId,
        machineId: input.machineId,
      } as MilkRecord);
    }

    const total = round(sum(entries.map((e) => e.volumeL)), 1);
    const rejected = round(sum(entries.map((e) => e.rejectedL ?? 0)), 1);

    let daily = this.db.milkDaily.find((d) => d.date === date);
    if (!daily) {
      daily = {
        date,
        morningL: 0,
        eveningL: 0,
        totalL: 0,
        rejectedL: 0,
        avgFat: 0,
        avgProtein: 0,
        milkingCows: 0,
      } as (typeof this.db.milkDaily)[number];
      this.db.milkDaily.push(daily);
      this.db.milkDaily.sort((a, b) => a.date.localeCompare(b.date));
    }

    // Assign rather than accumulate, so re-recording a session corrects it.
    if (session === "morning") daily.morningL = total;
    else daily.eveningL = total;
    daily.totalL = round(daily.morningL + daily.eveningL, 1);
    daily.rejectedL = rejected;
    daily.milkingCows = Math.max(entries.length, daily.milkingCows);
    if (input.fatPct) daily.avgFat = input.fatPct;
    if (input.proteinPct) daily.avgProtein = input.proteinPct;

    // The in-memory demo has no network to be offline from.
    await tick(undefined);
    return "acked";
  }

  getTransactions = () => tick(this.db.transactions);
  getInvoices = () => tick(this.db.invoices);

  async saveInvoice(invoice: EventWrite<Omit<Invoice, "id" | "farmId">>) {
    const idx = invoice.id ? this.db.invoices.findIndex((i) => i.id === invoice.id) : -1;
    if (idx >= 0) {
      this.db.invoices[idx] = { ...this.db.invoices[idx], ...invoice } as Invoice;
      return tick(this.db.invoices[idx]);
    }
    const created = {
      ...invoice,
      id: invoice.id ?? `inv_${Date.now()}`,
      farmId: this.db.farm.id,
    } as Invoice;
    this.db.invoices.unshift(created);
    return tick(created);
  }

  async setInvoiceStatus(id: ID, status: Invoice["status"]) {
    const idx = this.db.invoices.findIndex((i) => i.id === id);
    if (idx < 0) throw new Error(`Invoice ${id} not found`);
    // Replace, don't mutate — React Query's structural sharing skips an object
    // whose reference is unchanged, so an in-place edit renders stale.
    const updated = { ...this.db.invoices[idx], status };
    this.db.invoices[idx] = updated;
    return tick(updated);
  }

  async recordInvoicePayment(input: InvoicePaymentInput) {
    const idx = this.db.invoices.findIndex((i) => i.id === input.invoiceId);
    if (idx < 0) throw new Error(`Invoice ${input.invoiceId} not found`);
    const inv = this.db.invoices[idx];

    const total = invoiceTotal(inv);
    const paidAmount = round(Math.min(total, (inv.paidAmount ?? 0) + input.amount), 2);
    const updated: Invoice = {
      ...inv,
      paidAmount,
      status: paidAmount >= total ? "paid" : "partial",
    };
    this.db.invoices[idx] = updated;

    const partner = this.db.partners.find((p) => p.id === inv.customerId);
    const category =
      partner?.kind === "animal_buyer"
        ? "animal_sales"
        : partner?.kind === "milk_buyer"
          ? "milk_sales"
          : "other_income";

    this.db.transactions.unshift({
      id: `tx_${Date.now()}`,
      farmId: this.db.farm.id,
      kind: "income",
      category,
      amount: input.amount,
      date: input.date,
      description: `Payment · invoice ${inv.number}`,
      counterpartyId: inv.customerId,
      invoiceId: inv.id,
      paymentMethod: input.paymentMethod,
    } as Transaction);

    return tick(updated);
  }

  getPartners = () => tick(this.db.partners);

  getAssets = () => tick(this.db.assets);

  async saveAsset(asset: EventWrite<Omit<Asset, "id" | "farmId">>) {
    const idx = asset.id ? this.db.assets.findIndex((a) => a.id === asset.id) : -1;
    if (idx >= 0) {
      this.db.assets[idx] = { ...this.db.assets[idx], ...asset } as Asset;
      return tick(this.db.assets[idx]);
    }
    const created = { ...asset, id: asset.id ?? `asset_${Date.now()}`, farmId: this.db.farm.id } as Asset;
    this.db.assets.unshift(created);
    return tick(created);
  }

  async deleteAsset(id: ID) {
    this.db.assets = this.db.assets.filter((a) => a.id !== id);
    return tick(undefined);
  }

  /* ------------------------------ Automation ------------------------------- */

  async recordPurchase(input: PurchaseInput): Promise<Transaction> {
    const total = purchaseTotal(input);
    let name = "";
    let unit = "";
    let category: Transaction["category"];

    if (input.kind === "feed") {
      const item = this.db.feedItems.find((f) => f.id === input.itemId);
      if (!item) throw new Error("item-not-found");
      item.costPerUnit = blendedUnitCost(item.stock, item.costPerUnit, input.quantity, input.unitCost);
      item.stock = round(item.stock + input.quantity, 2);
      name = item.name;
      unit = item.unit;
      category = FEED_EXPENSE_CATEGORY;
    } else {
      const item = this.db.inventory.find((i) => i.id === input.itemId);
      if (!item) throw new Error("item-not-found");
      item.unitCost = blendedUnitCost(item.stock, item.unitCost, input.quantity, input.unitCost);
      item.stock = round(item.stock + input.quantity, 2);
      name = item.name;
      unit = item.unit;
      category = INVENTORY_EXPENSE_CATEGORY[item.category];
    }

    // The goods-in movement, so the stock ledger shows where the quantity came from.
    this.db.movements.unshift({
      id: `mv_${Date.now()}`,
      farmId: this.db.farm.id,
      itemId: input.itemId,
      date: input.date,
      kind: "in",
      quantity: input.quantity,
      reference: input.note ?? `Purchase @ ${input.unitCost}/${unit}`,
    });

    // Booking the expense auto-posts it to the ledger.
    return this.saveTransaction({
      date: input.date,
      kind: "expense",
      category,
      amount: total,
      description: `${name} — ${input.quantity} ${unit}`,
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

  /* -------------------------------- Cheques -------------------------------- */

  getCheques = () => tick(this.db.cheques);

  /** Posts the cheque's entry and remembers which entry it produced. */
  private postCheque(
    cheque: Cheque,
    phase: ChequePhase,
    opts: { treasuryAccountId?: ID; date?: string } = {},
  ) {
    const built = journalEntryFromCheque(
      cheque,
      phase,
      this.db.accounts,
      chequeNumber(cheque.kind, opts.date ?? cheque.dueDate, this.db.cheques.length + 1),
      opts,
    );
    if (!built) return;
    const entry = { ...built, id: `jv_chq_${cheque.id}_${phase}` } as JournalEntry;
    const idx = this.db.journalEntries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) this.db.journalEntries[idx] = entry;
    else this.db.journalEntries.unshift(entry);
    cheque.entryIds = [...(cheque.entryIds ?? []).filter((id) => id !== entry.id), entry.id];
  }

  async saveCheque(cheque: EventWrite<Omit<Cheque, "id" | "farmId">>) {
    const idx = cheque.id ? this.db.cheques.findIndex((c) => c.id === cheque.id) : -1;
    if (idx >= 0) {
      this.db.cheques[idx] = { ...this.db.cheques[idx], ...cheque } as Cheque;
      return tick(this.db.cheques[idx]);
    }
    const created = {
      ...cheque,
      id: cheque.id ?? `chq_${Date.now()}`,
      farmId: this.db.farm.id,
      createdAt: new Date().toISOString(),
    } as Cheque;
    this.db.cheques.unshift(created);
    // Taking (or writing) a cheque moves the debt into notes straight away.
    this.postCheque(created, "received");
    return tick(created);
  }

  async setChequeStatus(
    id: ID,
    status: ChequeStatus,
    opts: { treasuryAccountId?: ID; date?: string } = {},
  ) {
    const cheque = this.db.cheques.find((c) => c.id === id);
    if (!cheque) throw new Error("not-found");
    if (cheque.status !== "held") throw new Error("already-settled");

    if (status === "collected") this.postCheque(cheque, "settled", opts);
    else if (status === "bounced" || status === "cancelled") this.postCheque(cheque, "bounced", opts);

    cheque.status = status;
    cheque.settledAt = opts.date ?? new Date().toISOString().slice(0, 10);
    return tick(cheque);
  }

  /* ------------------------------ Accounting ------------------------------ */

  getAccounts = () => tick(this.db.accounts);

  async saveAccount(account: EventWrite<Omit<Account, "id" | "farmId">>) {
    const idx = account.id ? this.db.accounts.findIndex((a) => a.id === account.id) : -1;
    if (idx >= 0) {
      this.db.accounts[idx] = { ...this.db.accounts[idx], ...account } as Account;
      return tick(this.db.accounts[idx]);
    }
    const created = {
      ...account,
      id: account.id ?? `acc_${account.code}`,
      farmId: this.db.farm.id,
    } as Account;
    this.db.accounts.push(created);
    return tick(created);
  }

  async deleteAccount(id: ID) {
    const account = this.db.accounts.find((a) => a.id === id);
    if (!account) return tick(undefined);
    // Guard the three ways deleting an account would corrupt the books.
    if (account.systemKey) throw new Error("system-account");
    if (this.db.accounts.some((a) => a.parentId === id)) throw new Error("has-children");
    if (this.db.journalEntries.some((e) => e.lines.some((l) => l.accountId === id)))
      throw new Error("has-postings");
    this.db.accounts = this.db.accounts.filter((a) => a.id !== id);
    return tick(undefined);
  }

  getJournalEntries = () => tick(this.db.journalEntries);

  private assertYearOpen(fiscalYearId?: ID) {
    if (!fiscalYearId) return;
    const year = this.db.fiscalYears.find((y) => y.id === fiscalYearId);
    if (year && year.status === "closed") throw new Error("year-closed");
  }

  async saveJournalEntry(
    entry: EventWrite<Omit<JournalEntry, "id" | "farmId" | "number"> & { number?: string }>,
  ) {
    if (!isBalanced(entry.lines)) throw new Error("unbalanced");
    this.assertYearOpen(entry.fiscalYearId);

    const idx = entry.id ? this.db.journalEntries.findIndex((e) => e.id === entry.id) : -1;
    if (idx >= 0) {
      // A posted entry is history — correct it with a reversal, never an edit.
      if (this.db.journalEntries[idx].status === "posted") throw new Error("posted-immutable");
      this.db.journalEntries[idx] = { ...this.db.journalEntries[idx], ...entry } as JournalEntry;
      return tick(this.db.journalEntries[idx]);
    }

    const created = {
      ...entry,
      id: entry.id ?? `jv_${Date.now()}`,
      farmId: this.db.farm.id,
      number: entry.number ?? journalNumber(entry.date, this.db.journalEntries.length + 1),
      createdAt: new Date().toISOString(),
    } as JournalEntry;
    this.db.journalEntries.unshift(created);
    return tick(created);
  }

  async setJournalStatus(id: ID, status: JournalEntry["status"]) {
    const entry = this.db.journalEntries.find((e) => e.id === id);
    if (!entry) throw new Error("not-found");
    this.assertYearOpen(entry.fiscalYearId);
    if (status === "posted" && !isBalanced(entry.lines)) throw new Error("unbalanced");
    entry.status = status;
    if (status === "posted") entry.postedAt = new Date().toISOString();
    return tick(entry);
  }

  getFiscalYears = () => tick(this.db.fiscalYears);

  async saveFiscalYear(year: EventWrite<Omit<FiscalYear, "id" | "farmId">>) {
    const idx = year.id ? this.db.fiscalYears.findIndex((y) => y.id === year.id) : -1;
    if (idx >= 0) {
      this.db.fiscalYears[idx] = { ...this.db.fiscalYears[idx], ...year } as FiscalYear;
      return tick(this.db.fiscalYears[idx]);
    }
    const created = {
      ...year,
      id: year.id ?? `fy_${year.startDate.slice(0, 4)}`,
      farmId: this.db.farm.id,
    } as FiscalYear;
    this.db.fiscalYears.push(created);
    return tick(created);
  }

  async closeFiscalYear(id: ID) {
    const year = this.db.fiscalYears.find((y) => y.id === id);
    if (!year) throw new Error("not-found");
    year.status = "closed";
    year.closedAt = new Date().toISOString();
    return tick(year);
  }

  getAlerts = () => tick(this.db.alerts);

  async markAlertRead(id: ID) {
    const a = this.db.alerts.find((x) => x.id === id);
    if (a) a.read = true;
    return tick(undefined);
  }

  getWeather = () => tick(this.db.weather);
  getUtilities = () => tick(this.db.utilities);
}
