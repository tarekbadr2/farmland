/**
 * Repository contract — the seam between the UI and any storage backend.
 *
 * The demo adapter (in-memory, deterministic) and the Firestore adapter both
 * implement this. Feature code never imports either one directly; it goes
 * through `getRepository()` so the data source is a one-line swap.
 */

import type {
  Alert,
  Animal,
  AnimalDisposal,
  Attendance,
  BreedingEvent,
  DailyMilkPoint,
  Employee,
  Farm,
  FarmTask,
  FeedConsumption,
  FeedItem,
  FeedRation,
  HealthEvent,
  ID,
  InventoryItem,
  Invoice,
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

export interface AnimalQuery {
  search?: string;
  status?: Animal["status"] | "all";
  milkStatus?: Animal["milkStatus"] | "all";
  reproStatus?: Animal["reproStatus"] | "all";
  penId?: ID | "all";
  breed?: Animal["breed"] | "all";
  sex?: Animal["sex"] | "all";
  group?: "all" | "calves" | "adults" | "bulls";
  sortBy?: "tag" | "name" | "milk" | "age" | "weight" | "health";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The fate of a write from the UI's point of view.
 *
 * `"acked"` — the server confirmed it. `"queued"` — it's durable on the device
 * and will sync when the connection returns, so the UI should reassure rather
 * than block. The demo backend is always `"acked"`.
 */
export type WriteOutcome = "acked" | "queued";

/** One parlor session for a set of animals, plus the tank sample that covers it. */
export interface MilkSessionInput {
  date: string;
  session: MilkRecord["session"];
  entries: { animalId: ID; volumeL: number; rejectedL?: number }[];
  fatPct?: number;
  proteinPct?: number;
  somaticCellCount?: number;
  temperatureC?: number;
  workerId?: ID;
  machineId?: string;
}

/**
 * A write that must also change the animal it refers to.
 *
 * Recording a pregnancy check is not just an event — it moves the cow to
 * `pregnant` and sets a calving date. Callers shouldn't have to remember that,
 * and two separate writes could half-apply, so the adapters do both atomically.
 */
export type EventWrite<T> = T & { id?: ID };

/**
 * One feeding of one ration to one group.
 *
 * The caller names the ration, the pen and the head count; the adapter expands
 * the ration into its component feeds and draws each from stock. Kilograms and
 * cost are derived from the ration, never trusted from the client — otherwise a
 * feeding could report less consumption than it drew, and the books would drift
 * from the silo.
 */
export interface FeedConsumptionInput {
  date: string;
  zoneId: ID;
  rationId: ID;
  heads: number;
}

/**
 * A clock event or a status mark for one employee on one day.
 *
 * There is at most one attendance row per employee per day, so the adapter
 * upserts on a deterministic id. Worked and overtime hours are derived from the
 * clock times, never entered — a payroll figure someone typed by hand is a
 * dispute waiting to happen.
 */
export interface AttendanceInput {
  employeeId: ID;
  date: string;
  status: Attendance["status"];
  clockIn?: string;
  clockOut?: string;
}

/** A payment received against an invoice. */
export interface InvoicePaymentInput {
  invoiceId: ID;
  amount: number;
  date: string;
  paymentMethod: Transaction["paymentMethod"];
}

/** Line total of an invoice — the single definition, used everywhere. */
export function invoiceTotal(invoice: Pick<Invoice, "lines">): number {
  return (invoice.lines ?? []).reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
}

export interface FarmRepository {
  readonly source: "demo" | "firebase";

  getFarm(): Promise<Farm>;
  getZones(): Promise<Zone[]>;

  /* -------------------------------- Team --------------------------------- */
  getMembers(): Promise<Member[]>;
  getPendingInvites(): Promise<PendingInvite[]>;
  /** Parks an invite by email; a Cloud Function promotes it on first sign-in. */
  inviteMember(email: string, role: Role): Promise<PendingInvite>;
  setMemberRole(uid: ID, role: Role): Promise<void>;
  removeMember(uid: ID): Promise<void>;
  revokeInvite(email: string): Promise<void>;

  listAnimals(query?: AnimalQuery): Promise<Page<Animal>>;
  getAnimal(id: ID): Promise<Animal | null>;
  getAnimalTimeline(id: ID): Promise<TimelineEntry[]>;
  getAnimalMilkHistory(id: ID, days?: number): Promise<MilkRecord[]>;
  getAnimalWeightHistory(id: ID): Promise<{ date: string; weightKg: number }[]>;
  saveAnimal(animal: Partial<Animal> & { id?: ID }): Promise<Animal>;
  /** Records an animal leaving the herd: sets status + disposal, and for a sale
   *  posts the linked animal-sale income to the ledger, atomically. */
  disposeAnimal(id: ID, disposal: AnimalDisposal): Promise<Animal>;

  getMilkDaily(days?: number): Promise<DailyMilkPoint[]>;
  getMilkRecords(date: string): Promise<MilkRecord[]>;
  recordMilkSession(input: MilkSessionInput): Promise<WriteOutcome>;

  getBreedingEvents(): Promise<BreedingEvent[]>;
  getSemenInventory(): Promise<SemenStraw[]>;
  /** Also advances the animal's reproStatus and calving date where implied. */
  saveBreedingEvent(event: EventWrite<Omit<BreedingEvent, "id" | "farmId">>): Promise<BreedingEvent>;

  getHealthEvents(): Promise<HealthEvent[]>;
  /** Also updates health score, isolation status and withdrawal period. */
  saveHealthEvent(event: EventWrite<Omit<HealthEvent, "id" | "farmId">>): Promise<HealthEvent>;

  getFeedItems(): Promise<FeedItem[]>;
  getRations(): Promise<FeedRation[]>;
  getFeedConsumption(): Promise<FeedConsumption[]>;
  /** Logs a feeding and draws each of the ration's components from feed stock. */
  logFeedConsumption(input: FeedConsumptionInput): Promise<FeedConsumption>;

  getInventory(): Promise<InventoryItem[]>;
  getStockMovements(): Promise<StockMovement[]>;
  /** Records the movement and applies the delta to the item's stock level. */
  saveStockMovement(move: EventWrite<Omit<StockMovement, "id" | "farmId">>): Promise<StockMovement>;

  getEmployees(): Promise<Employee[]>;
  saveEmployee(employee: EventWrite<Omit<Employee, "id" | "farmId">>): Promise<Employee>;
  getAttendance(): Promise<Attendance[]>;
  /** Upserts today's attendance row for one employee; recomputes worked hours. */
  recordAttendance(input: AttendanceInput): Promise<Attendance>;

  getTasks(): Promise<FarmTask[]>;
  updateTask(id: ID, patch: Partial<FarmTask>): Promise<FarmTask>;
  saveTask(task: EventWrite<Omit<FarmTask, "id" | "farmId">>): Promise<FarmTask>;

  getTransactions(): Promise<Transaction[]>;
  saveTransaction(txn: EventWrite<Omit<Transaction, "id" | "farmId">>): Promise<Transaction>;
  getInvoices(): Promise<Invoice[]>;
  saveInvoice(invoice: EventWrite<Omit<Invoice, "id" | "farmId">>): Promise<Invoice>;
  setInvoiceStatus(id: ID, status: Invoice["status"]): Promise<Invoice>;
  /**
   * Records a payment against an invoice and posts the matching income to the
   * ledger, atomically — so the books and the receivables never disagree.
   */
  recordInvoicePayment(input: InvoicePaymentInput): Promise<Invoice>;
  getPartners(): Promise<Partner[]>;

  getAlerts(): Promise<Alert[]>;
  markAlertRead(id: ID): Promise<void>;

  getWeather(): Promise<WeatherNow>;
  getUtilities(): Promise<UtilityReading[]>;
}
