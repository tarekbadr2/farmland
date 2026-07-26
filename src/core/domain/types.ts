/**
 * Domain model — the language of the farm.
 *
 * These types are storage-agnostic on purpose: repositories in
 * `src/core/repositories` speak only in these shapes, so the Firestore adapter
 * and the in-memory demo adapter are interchangeable.
 */

export type ID = string;

/** An organization owns one or more farms. Lightweight grouping/identity layer
 *  above the farm; farm data is not nested under it. */
export interface Organization {
  id: ID;
  name: string;
  nameAr: string;
  ownerId: ID;
  createdAt: string;
}

/** Multi-tenant root. Everything below hangs off a farm. */
export interface Farm {
  id: ID;
  /** The organization this farm belongs to (added with the org layer). */
  orgId?: ID;
  name: string;
  nameAr: string;
  country: string;
  city: string;
  timezone: string;
  currency: "EGP" | "SAR" | "AED" | "USD";
  plan: "starter" | "growth" | "pro" | "enterprise" | "scale";
  animalLimit: number;
  createdAt: string;
  logoUrl?: string;
  coordinates: { lat: number; lng: number };
  /** Set while the farm holds tutorial sample data (drives the banner + tour). */
  isSample?: boolean;
  /** ISO time the guided tour first ran — so it auto-starts once ever, on the
   *  first open of the farm, not every visit or on another device. */
  tourSeenAt?: string;
  /** Billing state. Absent on farms created before billing existed — treated as
   *  grandfathered/active so no one is locked out. */
  subscription?: Subscription;
  /** AI advisor usage for the current calendar month (metered against the plan's
   *  quota). Server-maintained; resets when `month` rolls over. */
  aiUsage?: { month: string; count: number };
}

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export interface Subscription {
  status: SubscriptionStatus;
  tier: "starter" | "growth" | "pro" | "enterprise" | "scale";
  /** ISO date the free trial ends (while status is "trialing"). */
  trialEndsAt?: string | null;
  /** ISO date the current paid period ends (while status is "active"). */
  currentPeriodEnd?: string | null;
  provider?: "paymob" | null;
  /** Opaque reference from the payment provider (order/subscription id). */
  providerRef?: string | null;
}

// The access role. The full catalog (and its permission sets) lives in
// src/core/auth/permissions.ts; Role is an alias so the domain layer stays
// decoupled from the RBAC catalog while sharing one source of truth.
import type { RoleKey } from "@/core/auth/permissions";
export type Role = RoleKey;

export interface Membership {
  userId: ID;
  farmId: ID;
  role: Role;
  permissions: string[];
}

/** A person with access to the farm. Keyed in Firestore by their auth uid. */
export interface Member {
  id: ID; // the auth uid
  farmId: ID;
  /** The org this membership belongs to (mirrors the farm's org). */
  orgId?: ID;
  email: string;
  name?: string;
  role: Role;
  /** Authoritative permission keys. Empty/absent → derived from the role. */
  permissions?: string[];
  /** Links this login to an employee record, for task assignment. */
  employeeId?: ID;
  grantedAt?: string;
}

/**
 * An invited person who hasn't signed in yet.
 *
 * Firebase only issues a uid on first sign-in, so an invite can't become a real
 * member ahead of time. It's parked here keyed by email; a Cloud Function
 * promotes it to a member the first time that email signs in.
 */
export interface PendingInvite {
  email: ID;
  role: Role;
  invitedAt?: string;
}

/* --------------------------------- Audit ---------------------------------- */

export type AuditCategory =
  | "animals"
  | "medical"
  | "breeding"
  | "milk"
  | "feeding"
  | "inventory"
  | "tasks"
  | "finance"
  | "employees"
  | "members"
  | "system";

/**
 * One recorded action in the activity log. Append-only — an audit trail you can
 * edit isn't one. `summary`/`summaryAr` are the human line ("Dr. Ahmed
 * vaccinated EG-204"); `before`/`after` capture the change where it matters.
 */
export interface AuditEntry {
  id: ID;
  farmId: ID;
  /** ISO timestamp of the action. */
  at: string;
  actorUid: ID;
  actorName: string;
  actorRole: Role;
  category: AuditCategory;
  /** Machine key, e.g. "animal.create", "member.role". */
  action: string;
  summary: string;
  summaryAr?: string;
  /** What was acted on (a tag, a name, an id) for quick scanning. */
  target?: string;
  /** Best-effort client hint (user agent). IP is captured server-side only. */
  device?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/** What a caller supplies to log an action; the rest is stamped by the adapter. */
export interface AuditInput {
  category: AuditCategory;
  action: string;
  summary: string;
  summaryAr?: string;
  target?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface AppUser {
  id: ID;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  role: Role;
  farmId: ID;
  locale: "en" | "ar";
}

/* --------------------------------- Animals -------------------------------- */

export type AnimalStatus =
  | "active"
  | "sold"
  | "dead"
  | "culled"
  | "quarantine";

/** What an animal is raised for — decides which cost metric applies (cost per
 *  kg of liveweight for meat, cost per litre for dairy). */
export type AnimalPurpose = "dairy" | "meat" | "breeding";

/** Recorded when an animal leaves the herd (sold, died, or culled). Drives the
 *  disposal account and closes out its cost ledger. */
export interface AnimalDisposal {
  date: string;
  type: "sold" | "died" | "culled";
  /** Final weight (kg) at sale/exit — the denominator for cost per kg. */
  weightKg?: number;
  /** Money received (EGP). Zero for death/cull. */
  proceeds?: number;
  buyerId?: ID;
  note?: string;
}

export type MilkStatus = "lactating" | "dry" | "heifer" | "not_applicable";

export type ReproStatus =
  | "open"
  | "inseminated"
  | "pregnant"
  | "fresh"
  | "not_applicable";

export type Sex = "female" | "male";

export type Breed =
  | "egyptian_baladi"
  | "murrah"
  | "nili_ravi"
  | "jafarabadi"
  | "crossbreed";

export interface Animal {
  id: ID;
  farmId: ID;
  tag: string;
  rfid: string;
  microchip?: string;
  name: string;
  nameAr: string;
  sex: Sex;
  breed: Breed;
  bloodline?: string;
  motherId?: ID;
  fatherId?: ID;
  dateOfBirth: string;
  status: AnimalStatus;
  milkStatus: MilkStatus;
  reproStatus: ReproStatus;
  penId: ID;
  weightKg: number;
  healthScore: number; // 0..100
  lactationNumber: number;
  lastCalvingDate?: string;
  dryDate?: string;
  expectedCalvingDate?: string;

  /* Reproduction tracking. Services-per-conception and days-open are the two
     numbers that decide whether a dairy makes money, so they get first-class
     fields rather than being re-derived from the event log on every read. */
  lastHeatDate?: string;
  lastServiceDate?: string;
  /** Reset at calving. Three or more without conception is a repeat breeder. */
  servicesThisLactation?: number;
  calvesBorn?: number;

  /** Milk from this animal must not enter the bulk tank until this date. */
  withdrawalUntil?: string;

  avgDailyMilkL: number;
  /** Rolling baseline maintained by the daily job; drives milk-drop alerts. */
  milkBaselineL?: number;
  lifetimeMilkL: number;
  valuation: number;
  insurance?: { provider: string; policyNo: string; coverage: number; expiry: string };
  photoUrl?: string;
  notes?: string;
  acquiredAt: string;
  acquiredFrom?: "born_on_farm" | "purchased";
  isCalf: boolean;
  gpsCollar?: boolean;

  /* --- Livestock economics (cost analysis) --- */
  /** Raised for milk, meat, or breeding. Inferred from sex/role when unset. */
  purpose?: AnimalPurpose;
  /** Price paid to acquire (EGP). Undefined / 0 for born-on-farm. */
  acquisitionCost?: number;
  /** Weight (kg) at acquisition or birth — the baseline for weight gain. */
  acquisitionWeightKg?: number;
  /** Set once the animal leaves the herd; closes out its cost ledger. */
  disposal?: AnimalDisposal;
}

/* ---------------------------------- Pens ---------------------------------- */

export type ZoneKind =
  | "pen"
  | "barn"
  | "milking_parlor"
  | "feed_store"
  | "clinic"
  | "office"
  | "quarantine"
  | "water";

export interface Zone {
  id: ID;
  farmId: ID;
  name: string;
  nameAr: string;
  kind: ZoneKind;
  capacity: number;
  /** Normalised 0..100 layout grid used by the interactive farm map. */
  x: number;
  y: number;
  w: number;
  h: number;
  shadeCoverPct?: number;
  hasFans?: boolean;
}

/* ----------------------------------- Milk --------------------------------- */

export type MilkSession = "morning" | "evening";

export interface MilkRecord {
  id: ID;
  farmId: ID;
  animalId: ID;
  date: string;
  session: MilkSession;
  volumeL: number;
  fatPct: number;
  proteinPct: number;
  somaticCellCount: number;
  temperatureC: number;
  rejectedL: number;
  rejectionReason?: "antibiotic_residue" | "high_scc" | "abnormal_color" | "contamination";
  workerId?: ID;
  machineId?: string;
}

export interface DailyMilkPoint {
  date: string;
  morningL: number;
  eveningL: number;
  totalL: number;
  rejectedL: number;
  avgFat: number;
  avgProtein: number;
  milkingCows: number;
}

/* --------------------------------- Breeding -------------------------------- */

export type BreedingEventType =
  | "heat"
  | "ai"
  | "natural_mating"
  | "pregnancy_check"
  | "calving"
  | "abortion"
  | "dry_off";

export interface BreedingEvent {
  id: ID;
  farmId: ID;
  animalId: ID;
  type: BreedingEventType;
  date: string;
  sireId?: ID;
  semenBatch?: string;
  technician?: string;
  result?: "pregnant" | "open" | "inconclusive";
  calfIds?: ID[];
  outcome?: "live" | "stillbirth" | "twins" | "died_24h";
  notes?: string;
}

export interface SemenStraw {
  id: ID;
  farmId: ID;
  batch: string;
  sireName: string;
  sireBreed: Breed;
  quantity: number;
  collectedAt: string;
  expiresAt: string;
  tankId: string;
  costPerStraw: number;
  conceptionRate: number;
}

/* ---------------------------------- Health --------------------------------- */

export type HealthEventType =
  | "vaccination"
  | "treatment"
  | "diagnosis"
  | "surgery"
  | "lab_result"
  | "vet_visit"
  | "checkup";

export type Disease =
  | "mastitis"
  | "lameness"
  | "ketosis"
  | "milk_fever"
  | "pneumonia"
  | "diarrhea"
  | "fmd"
  | "brucellosis"
  | "metritis"
  | "parasites";

export interface HealthEvent {
  id: ID;
  farmId: ID;
  animalId: ID;
  type: HealthEventType;
  date: string;
  disease?: Disease;
  vaccine?: string;
  medication?: string;
  dosage?: string;
  vitals?: { temperatureC?: number; heartRate?: number; respiration?: number };
  vetName?: string;
  cost: number;
  withdrawalUntil?: string;
  outcome?: "recovered" | "ongoing" | "chronic" | "died";
  isolation?: boolean;
  nextDueDate?: string;
  notes?: string;
}

/* ----------------------------------- Feed ---------------------------------- */

export type FeedCategory =
  | "concentrate"
  | "roughage"
  | "silage"
  | "mineral"
  | "supplement";

export interface FeedItem {
  id: ID;
  farmId: ID;
  name: string;
  nameAr: string;
  category: FeedCategory;
  unit: "kg" | "ton" | "bale";
  stock: number;
  reorderLevel: number;
  costPerUnit: number;
  supplierId: ID;
  expiresAt?: string;
  dryMatterPct: number;
  proteinPct: number;
  energyMcalPerKg: number;
}

export interface FeedRation {
  id: ID;
  farmId: ID;
  name: string;
  nameAr: string;
  targetGroup: "lactating" | "dry" | "calves" | "bulls" | "heifers";
  components: { feedItemId: ID; kgPerHead: number }[];
  costPerHead: number;
}

export interface FeedConsumption {
  id: ID;
  farmId: ID;
  date: string;
  zoneId: ID;
  rationId: ID;
  kg: number;
  cost: number;
  heads: number;
}

/* -------------------------------- Inventory -------------------------------- */

export type InventoryCategory =
  | "medicine"
  | "equipment"
  | "cleaning"
  | "tools"
  | "fuel"
  | "parts"
  | "consumables";

export interface InventoryItem {
  id: ID;
  farmId: ID;
  sku: string;
  name: string;
  nameAr: string;
  category: InventoryCategory;
  unit: string;
  stock: number;
  reorderLevel: number;
  unitCost: number;
  supplierId: ID;
  expiresAt?: string;
  location: string;
  batchNo?: string;
}

/* --------------------------------- Stores ---------------------------------- */
/* المخازن — a farm keeps stock in more than one place: a feed store, a
 * medicine cupboard, a silage bunker. Movements say which store they happened
 * in, so each one has its own balance and can be counted on its own. */

export interface Warehouse {
  id: ID;
  farmId: ID;
  name: string;
  nameAr: string;
  /** The store that unassigned (pre-multi-store) movements belong to. */
  isDefault?: boolean;
  location?: string;
  active: boolean;
}

export interface StockMovement {
  id: ID;
  farmId: ID;
  itemId: ID;
  date: string;
  kind: "in" | "out" | "adjustment" | "waste";
  quantity: number;
  reference?: string;
  userId?: ID;
  /** Which store. Absent on rows written before stores existed — those are
   *  treated as the default store rather than as belonging nowhere. */
  warehouseId?: ID;
  /** Links the two halves of a transfer (اذن تحويل): one `out`, one `in`. */
  transferId?: ID;
  /** On a stocktake adjustment, what was actually counted on the shelf. */
  countedQty?: number;
}

/* -------------------------------- Employees -------------------------------- */

export type EmployeeRole =
  | "milker"
  | "feeder"
  | "vet_assistant"
  | "supervisor"
  | "driver"
  | "cleaner"
  | "accountant"
  | "manager";

export interface Employee {
  id: ID;
  farmId: ID;
  code: string;
  name: string;
  nameAr: string;
  role: EmployeeRole;
  phone: string;
  nationalId: string;
  hiredAt: string;
  monthlySalary: number;
  shift: "morning" | "evening" | "night" | "rotating";
  active: boolean;
  performanceScore: number;
  avatarUrl?: string;
  trainings: { name: string; completedAt: string }[];
  safetyIncidents: number;
}

export interface Attendance {
  id: ID;
  farmId: ID;
  employeeId: ID;
  date: string;
  clockIn?: string;
  clockOut?: string;
  status: "present" | "absent" | "leave" | "late";
  hours: number;
  overtimeHours: number;
}

/* ----------------------------------- Tasks --------------------------------- */

export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskStatus = "todo" | "in_progress" | "done" | "missed";
export type TaskCategory =
  | "milking"
  | "feeding"
  | "health"
  | "breeding"
  | "cleaning"
  | "maintenance"
  | "admin";

export interface FarmTask {
  id: ID;
  farmId: ID;
  title: string;
  titleAr: string;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: string;
  assigneeId?: ID;
  animalId?: ID;
  zoneId?: ID;
  recurrence?: "daily" | "weekly" | "monthly" | "none";
  completedAt?: string;
  notes?: string;
}

/* ---------------------------------- Finance -------------------------------- */

export type TxnKind = "income" | "expense";
export type TxnCategory =
  | "milk_sales"
  | "animal_sales"
  | "manure_sales"
  | "other_income"
  | "feed"
  | "medicine"
  | "labor"
  | "fuel"
  | "utilities"
  | "maintenance"
  | "veterinary"
  | "transport"
  | "rent"
  | "other_expense";

export interface Transaction {
  id: ID;
  farmId: ID;
  date: string;
  kind: TxnKind;
  category: TxnCategory;
  amount: number;
  description: string;
  counterpartyId?: ID;
  invoiceId?: ID;
  /** Links the money to a specific animal (e.g. an animal sale) for per-animal
   *  profitability. */
  animalId?: ID;
  paymentMethod: "cash" | "bank" | "credit";
}

/**
 * مبيعات / مشتريات / مرتجعات — what kind of document this is.
 *
 * A sale bills a customer; a purchase is a supplier's bill to the farm. The two
 * return kinds undo their counterpart, which is why they post the mirror image
 * of it rather than a negative amount.
 */
export type InvoiceKind = "sale" | "purchase" | "sale_return" | "purchase_return";

export interface Invoice {
  id: ID;
  farmId: ID;
  number: string;
  /** Absent on documents created before purchases existed — treat as "sale". */
  kind?: InvoiceKind;
  /** The other party: a customer on a sale, a supplier on a purchase. */
  customerId: ID;
  issuedAt: string;
  dueAt: string;
  lines: { description: string; qty: number; unitPrice: number }[];
  paidAmount: number;
  status: "draft" | "sent" | "partial" | "paid" | "overdue";
  /** Which revenue/expense account it books to; falls back to a sensible default. */
  accountId?: ID;
  /** For a return, the document it reverses. */
  returnsInvoiceId?: ID;
}

/* --------------------------------- Assets ---------------------------------- */

export type AssetCategory =
  | "land"
  | "building"
  | "machine"
  | "equipment"
  | "vehicle"
  /** Purchased breeding/fattening stock — capital, not an operating cost. */
  | "livestock"
  | "other";

/** A capital/fixed asset — land, buildings, machinery, vehicles, equipment.
 *  Livestock is tracked as animals, not here; the herd's book value is summed
 *  separately. Straight-line depreciation runs off `usefulLifeYears`. */
export interface Asset {
  id: ID;
  farmId: ID;
  name: string;
  nameAr?: string;
  category: AssetCategory;
  acquiredDate: string;
  /** Capital cost (EGP). */
  cost: number;
  /** Residual value at end of useful life (EGP). */
  salvageValue?: number;
  /** Useful life in years for straight-line depreciation. Omit/0 for a
   *  non-depreciating asset such as land. */
  usefulLifeYears?: number;
  serialNo?: string;
  location?: string;
  notes?: string;
  status?: "active" | "disposed";
}

/* -------------------------------- Customers -------------------------------- */

export type PartnerKind = "milk_buyer" | "animal_buyer" | "supplier" | "veterinarian";

export interface Partner {
  id: ID;
  farmId: ID;
  kind: PartnerKind;
  name: string;
  nameAr: string;
  contactName: string;
  phone: string;
  email?: string;
  address?: string;
  balance: number;
  creditLimit?: number;
  rating: number;
  since: string;
}

/* ------------------------------ Notifications ------------------------------ */

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertChannel = "push" | "sms" | "email" | "in_app";

export interface Alert {
  id: ID;
  farmId: ID;
  severity: AlertSeverity;
  category:
    | "health"
    | "breeding"
    | "milk"
    | "inventory"
    | "weather"
    | "task"
    | "finance"
    | "system";
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  createdAt: string;
  read: boolean;
  animalId?: ID;
  href?: string;
  channels: AlertChannel[];
}

/* --------------------------------- Weather --------------------------------- */

export interface WeatherNow {
  temperatureC: number;
  humidityPct: number;
  windKph: number;
  condition: "clear" | "cloudy" | "rain" | "dust" | "hot";
  /** Temperature–Humidity Index — the standard heat-stress metric for buffalo. */
  thi: number;
  heatStress: "none" | "mild" | "moderate" | "severe";
  forecast: {
    date: string;
    minC: number;
    maxC: number;
    humidityPct: number;
    thi: number;
    condition: WeatherNow["condition"];
  }[];
}

/* --------------------------------- Sensors --------------------------------- */

export interface UtilityReading {
  date: string;
  waterM3: number;
  electricityKwh: number;
  dieselL: number;
  /** Natural gas / LPG consumption (m³). */
  gasM3?: number;
  /** Solar generation (kWh) — offsets grid electricity cost as a saving. */
  solarKwh?: number;
  outageMinutes: number;
  co2eKg: number;
}

/* -------------------------------- Timeline --------------------------------- */

export interface TimelineEntry {
  id: ID;
  date: string;
  kind:
    | "birth"
    | "milk"
    | "health"
    | "breeding"
    | "movement"
    | "weight"
    | "financial"
    | "note";
  title: string;
  titleAr: string;
  detail?: string;
  detailAr?: string;
  icon?: string;
}

/* ------------------------------- Accounting -------------------------------- */
/* Double-entry bookkeeping (شجرة الحسابات / القيود). Mirrors the structure an
 * Egyptian accountant expects: a coded account tree, journal entries whose
 * debits must equal credits, and fiscal years that can be closed. Branch and
 * currency live on the records from day one so multi-branch / multi-currency
 * can switch on without a data migration. */

/** أصول / خصوم / حقوق ملكية / إيرادات / مصروفات */
export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

/** طبيعة الحساب — which side increases the account. */
export type AccountNature = "debit" | "credit";

export interface Account {
  id: ID;
  farmId: ID;
  /** Hierarchical code, e.g. "1", "102", "10201". Sorts the tree and is what
   *  accountants actually refer to. */
  code: string;
  parentId?: ID | null;
  name: string;
  nameAr: string;
  type: AccountType;
  nature: AccountNature;
  /** Group (parent) accounts are headers — you post to leaves only. */
  isGroup: boolean;
  /** Opening balance carried into the first fiscal year, in `nature` terms. */
  openingBalance?: number;
  /** ISO currency; defaults to the farm currency. */
  currency?: string;
  branchId?: ID;
  active: boolean;
  /** Marks accounts the system relies on (cash, AR, AP…) so they can't be deleted. */
  systemKey?: string;
  createdAt?: string;
}

export interface JournalLine {
  accountId: ID;
  /** Exactly one of debit/credit is non-zero on a well-formed line. */
  debit: number;
  credit: number;
  description?: string;
  /** Optional analytical tags — lets the ledger answer "per animal / per pen". */
  partnerId?: ID;
  animalId?: ID;
  zoneId?: ID;
}

export type JournalStatus = "draft" | "posted" | "void";

/** A journal entry (قيد يومية). Source documents (invoices, vouchers, stock
 *  notes) will each post one of these, tagged via `sourceKind`/`sourceId`. */
export interface JournalEntry {
  id: ID;
  farmId: ID;
  /** Human-facing sequential number, e.g. "JV-2026-0001". */
  number: string;
  date: string;
  description: string;
  descriptionAr?: string;
  reference?: string;
  fiscalYearId?: ID;
  branchId?: ID;
  currency?: string;
  /** Rate to the farm's base currency (1 when same). */
  exchangeRate?: number;
  status: JournalStatus;
  lines: JournalLine[];
  /** What produced this entry — "manual" for hand-keyed ones. */
  sourceKind?: "manual" | "invoice" | "purchase" | "voucher" | "stock" | "payroll" | "depreciation";
  sourceId?: ID;
  createdAt?: string;
  createdBy?: ID;
  postedAt?: string;
}

/** السنة المالية — postings are only allowed into an open year. */
export interface FiscalYear {
  id: ID;
  farmId: ID;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
  closedAt?: string;
}

/* --------------------------------- Cheques --------------------------------- */
/* أوراق القبض / أوراق الدفع — post-dated cheques and promissory notes.
 *
 * A cheque isn't cash yet: taking one from a customer converts their debt into
 * a note, and only collecting it turns the note into money. Each step in that
 * life posts its own journal entry, so the books follow the paper. */

export type ChequeKind = "receivable" | "payable";

/** held → collected, or held → bounced / cancelled. */
export type ChequeStatus = "held" | "collected" | "bounced" | "cancelled";

export interface Cheque {
  id: ID;
  farmId: ID;
  kind: ChequeKind;
  /** The number printed on the cheque itself. */
  chequeNumber: string;
  amount: number;
  issuedDate: string;
  /** When it can be presented — drives the "due soon" view. */
  dueDate: string;
  partnerId?: ID;
  bankName?: string;
  status: ChequeStatus;
  notes?: string;
  /** Journal entries this cheque has produced, in order. */
  entryIds?: ID[];
  createdAt?: string;
  settledAt?: string;
}

/* --------------------------- Livestock transfers --------------------------- */
/* اذن تحويل رؤوس — moving head between pens is a document, not a silent field
 * edit: it says who moved what, when and why, and it's what a vet or an auditor
 * asks for when a group's history stops making sense. */

export type TransferReason =
  | "regrouping"
  | "medical"
  | "dry_off"
  | "calving"
  | "sale_prep"
  | "other";

export interface LivestockTransfer {
  id: ID;
  farmId: ID;
  /** Sequential document number, e.g. LT-2026-0001. */
  number: string;
  date: string;
  /** Absent when the animals came from different pens. */
  fromZoneId?: ID;
  toZoneId: ID;
  animalIds: ID[];
  reason?: TransferReason;
  notes?: string;
  createdBy?: ID;
  createdAt?: string;
}

export type TransferRequestStatus = "pending" | "approved" | "rejected";

/**
 * A proposed pen move awaiting approval (طلب تحويل). Any member may raise one;
 * approving it executes the real, immutable LivestockTransfer (and the pen
 * moves), which is why approval needs animals.write. Rejecting closes it with a
 * note. The request is the mutable workflow object; the transfer it produces is
 * the permanent record.
 */
export interface TransferRequest {
  id: ID;
  farmId: ID;
  status: TransferRequestStatus;
  toZoneId: ID;
  animalIds: ID[];
  date: string;
  reason?: TransferReason;
  notes?: string;
  requestedBy?: ID;
  requestedByName?: string;
  requestedAt: string;
  decidedBy?: ID;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  /** The LivestockTransfer created when the request is approved. */
  transferId?: ID;
}

/* ------------------------------- Production -------------------------------- */
/* أمر شغل — turning inputs into outputs: milk into cheese, ingredients into a
 * mixed ration. The point isn't the paperwork, it's the cost: what the farm
 * spent on materials plus overhead becomes the output's unit cost, which is the
 * only honest basis for pricing it. */

export type WorkOrderStatus = "planned" | "done" | "cancelled";

/** Feed and inventory are separate stock lists, so a line says which one. */
export interface WorkOrderLine {
  source: "inventory" | "feed";
  itemId: ID;
  quantity: number;
}

export interface WorkOrder {
  id: ID;
  farmId: ID;
  /** Sequential document number, e.g. WO-2026-0001. */
  number: string;
  date: string;
  name: string;
  nameAr?: string;
  status: WorkOrderStatus;
  inputs: WorkOrderLine[];
  outputs: WorkOrderLine[];
  /** Which store the materials come from and the product goes to. */
  warehouseId?: ID;
  /** Labour, power, anything beyond the materials themselves. */
  overheadCost?: number;
  /** Snapshotted when completed, so later price changes don't rewrite history. */
  materialCost?: number;
  totalCost?: number;
  notes?: string;
  completedAt?: string;
}

/* ------------------------------ Organisation -------------------------------- */
/* الفروع والعملات — a farm that grows into several sites, and one that buys
 * from abroad, both need the books to say *where* and *in what money*. Both
 * fields already live on Account and JournalEntry, so switching these on is
 * additive rather than a migration. */

export interface Branch {
  id: ID;
  farmId: ID;
  name: string;
  nameAr: string;
  /** Where postings land when nothing else is chosen. */
  isDefault?: boolean;
  location?: string;
  active: boolean;
}

/**
 * A currency the farm transacts in.
 *
 * `rateToBase` converts one unit into the farm's base currency: with EGP as
 * base, USD sits at ~48. The base currency itself is always exactly 1.
 */
export interface Currency {
  id: ID;
  farmId: ID;
  /** ISO code — USD, EUR, EGP. */
  code: string;
  name: string;
  nameAr: string;
  rateToBase: number;
  isBase?: boolean;
  active: boolean;
  updatedAt?: string;
}
