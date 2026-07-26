/**
 * Repository contract — the seam between the UI and any storage backend.
 *
 * The demo adapter (in-memory, deterministic) and the Firestore adapter both
 * implement this. Feature code never imports either one directly; it goes
 * through `getRepository()` so the data source is a one-line swap.
 */

import type {
  Account,
  Branch,
  Cheque,
  ChequeStatus,
  Currency,
  Alert,
  Animal,
  AuditEntry,
  AuditInput,
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
  LivestockTransfer,
  TransferRequest,
  Member,
  MilkRecord,
  Partner,
  PendingInvite,
  Role,
  SemenStraw,
  StockMovement,
  TimelineEntry,
  Transaction,
  TransferReason,
  UtilityReading,
  Warehouse,
  WorkOrder,
  WeatherNow,
  Zone,
} from "@/core/domain/types";
import type { CostInput, PurchaseInput } from "@/core/services/automation";

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

/** Head moving from wherever they are into one pen. */
export interface LivestockTransferInput {
  toZoneId: ID;
  animalIds: ID[];
  date: string;
  reason?: TransferReason;
  notes?: string;
}

/** One item moving from one store to another. */
export interface StockTransferInput {
  itemId: ID;
  fromWarehouseId: ID;
  toWarehouseId: ID;
  quantity: number;
  date: string;
  reference?: string;
}

/** A physical count of one store on one day. */
export interface StocktakeInput {
  warehouseId: ID;
  date: string;
  lines: { itemId: ID; counted: number }[];
  reference?: string;
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

  getAssets(): Promise<Asset[]>;
  saveAsset(asset: EventWrite<Omit<Asset, "id" | "farmId">>): Promise<Asset>;
  deleteAsset(id: ID): Promise<void>;

  /* ------------------------------ Automation ------------------------------- */
  /**
   * Buys stock: raises the item's level, blends its unit cost, and books the
   * spend as an expense — which auto-posts to the ledger. One action, and the
   * store, the expense list and the books all agree.
   */
  recordPurchase(input: PurchaseInput): Promise<Transaction>;
  /** Books a non-stock cost (maintenance, transport, wages) the same way. */
  recordCost(input: CostInput): Promise<Transaction>;

  /* ------------------------------ Organisation ------------------------------ */
  getBranches(): Promise<Branch[]>;
  saveBranch(branch: EventWrite<Omit<Branch, "id" | "farmId">>): Promise<Branch>;
  getCurrencies(): Promise<Currency[]>;
  /** Rates are quoted against the farm's base currency, which is always 1. */
  saveCurrency(currency: EventWrite<Omit<Currency, "id" | "farmId">>): Promise<Currency>;

  /* -------------------------------- Production ------------------------------ */
  getWorkOrders(): Promise<WorkOrder[]>;
  saveWorkOrder(order: EventWrite<Omit<WorkOrder, "id" | "farmId" | "number"> & { number?: string }>): Promise<WorkOrder>;
  /**
   * أمر شغل — runs the order: draws every input from stock, adds the outputs,
   * and rolls material + overhead cost into the outputs' unit cost. Refuses if
   * an input isn't on hand, since the resulting cost would be meaningless.
   */
  completeWorkOrder(id: ID): Promise<WorkOrder>;

  /* --------------------------- Livestock transfers -------------------------- */
  getLivestockTransfers(): Promise<LivestockTransfer[]>;
  /**
   * اذن تحويل رؤوس — records the document and moves every animal's pen in one
   * go, so the paperwork and the herd can't disagree. Rejects a move the
   * validator refuses (empty, wrong kind of zone, animals that have left).
   */
  recordLivestockTransfer(input: LivestockTransferInput): Promise<LivestockTransfer>;

  /* --------------------- Transfer requests (approval) -------------------- */
  getTransferRequests(): Promise<TransferRequest[]>;
  /** Raise a pending move for approval. Any member may request. */
  createTransferRequest(input: LivestockTransferInput): Promise<TransferRequest>;
  /** Approve a request: executes the real transfer + pen moves. Needs animals.write. */
  approveTransferRequest(id: ID): Promise<LivestockTransfer>;
  /** Reject a request with an optional note. Needs animals.write. */
  rejectTransferRequest(id: ID, note?: string): Promise<void>;

  /* -------------------------------- Stores --------------------------------- */
  getWarehouses(): Promise<Warehouse[]>;
  saveWarehouse(warehouse: EventWrite<Omit<Warehouse, "id" | "farmId">>): Promise<Warehouse>;
  /**
   * اذن تحويل — moves stock between stores as a paired out/in. Rejects a
   * transfer larger than the source store actually holds; the farm-wide total
   * is unchanged either way, so only the per-store check can catch it.
   */
  transferStock(input: StockTransferInput): Promise<StockMovement[]>;
  /**
   * جرد — reconciles counted quantities against expected, writing one signed
   * adjustment per line that differs. Lines that match write nothing.
   */
  recordStocktake(input: StocktakeInput): Promise<StockMovement[]>;

  /* -------------------------------- Cheques -------------------------------- */
  getCheques(): Promise<Cheque[]>;
  /** Records a cheque and posts the entry moving the debt into notes. */
  saveCheque(cheque: EventWrite<Omit<Cheque, "id" | "farmId">>): Promise<Cheque>;
  /**
   * Settles, returns or cancels a cheque and posts the matching entry —
   * collecting needs the treasury the money landed in.
   */
  setChequeStatus(
    id: ID,
    status: ChequeStatus,
    opts?: { treasuryAccountId?: ID; date?: string },
  ): Promise<Cheque>;

  /* ------------------------------ Accounting ------------------------------ */
  /** The chart of accounts. Seeded with a default farm tree on first read. */
  getAccounts(): Promise<Account[]>;
  saveAccount(account: EventWrite<Omit<Account, "id" | "farmId">>): Promise<Account>;
  /** Refuses to delete system accounts, group accounts with children, or any
   *  account that already carries postings. */
  deleteAccount(id: ID): Promise<void>;

  getJournalEntries(): Promise<JournalEntry[]>;
  /** Saves a draft or posted entry; rejects one whose debits ≠ credits. */
  saveJournalEntry(
    entry: EventWrite<Omit<JournalEntry, "id" | "farmId" | "number"> & { number?: string }>,
  ): Promise<JournalEntry>;
  /** Posts a draft into the ledger (or voids a posted entry — never deletes,
   *  so the audit trail survives). */
  setJournalStatus(id: ID, status: JournalEntry["status"]): Promise<JournalEntry>;

  getFiscalYears(): Promise<FiscalYear[]>;
  saveFiscalYear(year: EventWrite<Omit<FiscalYear, "id" | "farmId">>): Promise<FiscalYear>;
  /** Closes a year: locks further posting into it. */
  closeFiscalYear(id: ID): Promise<FiscalYear>;

  getAlerts(): Promise<Alert[]>;
  markAlertRead(id: ID): Promise<void>;

  getWeather(): Promise<WeatherNow>;
  getUtilities(): Promise<UtilityReading[]>;

  /* -------------------------------- Audit -------------------------------- */
  /** Append one entry to the activity log. Best-effort — never throws into the
   *  caller (a failed audit write must not fail the action it records). */
  logActivity(input: AuditInput): Promise<void>;
  listActivity(limit?: number): Promise<AuditEntry[]>;
}
