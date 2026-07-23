/**
 * Deterministic demo dataset.
 *
 * The demo adapter behind the repository layer needs a herd that behaves like a
 * real one: lactation curves that decay, pregnancies that follow a 310-day
 * gestation, heat stress that dents yield in July, disease clusters, and books
 * that actually balance. Everything is generated from a fixed seed so server
 * and client render byte-identical output.
 *
 * Swap this for the Firestore adapter by flipping NEXT_PUBLIC_DATA_SOURCE.
 */

import { mulberry32, clamp, round } from "@/lib/utils";
import { addDays, diffDays, rangeDays, toISODate } from "@/lib/date";
import { defaultChartOfAccounts } from "@/core/data/chart-of-accounts";
import { journalFromTransactions } from "@/core/services/posting";
import type {
  Account,
  Alert,
  Animal,
  Asset,
  Attendance,
  BreedingEvent,
  Breed,
  DailyMilkPoint,
  Disease,
  Employee,
  EmployeeRole,
  Farm,
  FeedConsumption,
  FeedItem,
  FeedRation,
  FiscalYear,
  HealthEvent,
  InventoryItem,
  Invoice,
  JournalEntry,
  Partner,
  SemenStraw,
  StockMovement,
  FarmTask,
  Transaction,
  UtilityReading,
  WeatherNow,
  Zone,
} from "@/core/domain/types";

export const FARM_ID = "farm_nile_delta";

/** Anchor "today" once so every derived series is stable within a session. */
export const TODAY = toISODate(new Date());

const AR_FEMALE_NAMES = [
  "زهرة", "قمر", "لؤلؤة", "نجمة", "شمس", "ياسمين", "سكرة", "حلوة", "بركة", "أمورة",
  "فلة", "دهب", "مليكة", "صافي", "ندى", "عسل", "جميلة", "بيضة", "سمرة", "روزا",
];
const EN_FEMALE_NAMES = [
  "Zahra", "Qamar", "Lulu", "Najma", "Shams", "Yasmin", "Sukkara", "Helwa", "Baraka", "Amoura",
  "Fella", "Dahab", "Malika", "Safi", "Nada", "Assal", "Jamila", "Baida", "Samra", "Rosa",
];
const AR_MALE_NAMES = ["سلطان", "عنتر", "فارس", "أسد", "بطل", "صقر", "نمر", "جبل"];
const EN_MALE_NAMES = ["Sultan", "Antar", "Faris", "Assad", "Batal", "Saqr", "Nimr", "Gabal"];

const BREEDS: Breed[] = [
  "egyptian_baladi",
  "egyptian_baladi",
  "egyptian_baladi",
  "murrah",
  "murrah",
  "nili_ravi",
  "jafarabadi",
  "crossbreed",
];

const COLORS = ["black", "dark_grey", "slate", "brown_black", "ash"];
const BLOODLINES = ["Delta-A", "Delta-B", "Murrah-Elite", "Ravi-Line", "Nile-Crest", "Fayoum-7"];

export interface FarmDataset {
  farm: Farm;
  zones: Zone[];
  animals: Animal[];
  employees: Employee[];
  attendance: Attendance[];
  breeding: BreedingEvent[];
  semen: SemenStraw[];
  health: HealthEvent[];
  feedItems: FeedItem[];
  rations: FeedRation[];
  feedConsumption: FeedConsumption[];
  inventory: InventoryItem[];
  movements: StockMovement[];
  tasks: FarmTask[];
  transactions: Transaction[];
  invoices: Invoice[];
  partners: Partner[];
  assets: Asset[];
  accounts: Account[];
  journalEntries: JournalEntry[];
  fiscalYears: FiscalYear[];
  alerts: Alert[];
  weather: WeatherNow;
  utilities: UtilityReading[];
  milkDaily: DailyMilkPoint[];
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function between(rand: () => number, min: number, max: number) {
  return min + rand() * (max - min);
}

/** Gaussian-ish via averaging — avoids the flat look of pure uniform noise. */
function noise(rand: () => number, spread = 1) {
  return ((rand() + rand() + rand()) / 3 - 0.5) * 2 * spread;
}

/**
 * Wood's lactation curve — the standard model for daily yield.
 *   y = a · t^b · e^(−c·t),  t = days in milk
 *
 * With b = 0.22 and c = 0.0035 the curve peaks at t = b/c ≈ 63 days, which is
 * where buffalo actually peak. `WOODS_PEAK` is the shape's value at that point,
 * so dividing by it normalises the curve to 1.0 at peak — that lets callers
 * express the curve in the only unit a farmer cares about: litres at peak.
 */
const WOODS_B = 0.22;
const WOODS_C = 0.0035;
const WOODS_PEAK_DAY = WOODS_B / WOODS_C;
const WOODS_PEAK =
  Math.pow(WOODS_PEAK_DAY, WOODS_B) * Math.exp(-WOODS_C * WOODS_PEAK_DAY);

/** Fraction of peak yield expected at `dim` days in milk. 1.0 at the peak. */
export function woodsShape(dim: number) {
  if (dim <= 0) return 0;
  return (Math.pow(dim, WOODS_B) * Math.exp(-WOODS_C * dim)) / WOODS_PEAK;
}

export function woodsCurve(dim: number, peak: number) {
  return Math.max(0, peak * woodsShape(dim));
}

/** Seasonal multiplier: Egyptian buffalo drop hard in the July/August heat. */
export function seasonalFactor(dateISO: string) {
  const m = Number(dateISO.slice(5, 7));
  const summerDip = [0, 0.03, 0.04, 0.02, -0.01, -0.05, -0.09, -0.11, -0.07, -0.02, 0.02, 0.03, 0.03];
  return 1 + summerDip[m];
}

/* -------------------------------------------------------------------------- */
/*                                   Builder                                  */
/* -------------------------------------------------------------------------- */

let cached: FarmDataset | null = null;

export function getDataset(): FarmDataset {
  if (cached) return cached;
  cached = build();
  return cached;
}

function build(): FarmDataset {
  const rand = mulberry32(20260720);

  /* ---------------------------------- Farm --------------------------------- */
  const farm: Farm = {
    id: FARM_ID,
    name: "Nile Delta Buffalo Estate",
    nameAr: "مزرعة دلتا النيل للجاموس",
    country: "Egypt",
    city: "Kafr El Sheikh",
    timezone: "Africa/Cairo",
    currency: "EGP",
    plan: "growth",
    animalLimit: 5000,
    createdAt: "2016-03-11",
    coordinates: { lat: 31.1107, lng: 30.9388 },
  };

  /* ---------------------------------- Zones -------------------------------- */
  const zoneDefs: Array<[string, string, Zone["kind"], number, number, number, number, number]> = [
    // Capacities carry ~15–25% headroom over current stocking; a pen that reads
    // over 100% on the map means something actually went wrong.
    ["Pen A1 — High Yield", "حظيرة أ١ — إنتاج عالي", "pen", 115, 4, 6, 20, 20],
    ["Pen A2 — High Yield", "حظيرة أ٢ — إنتاج عالي", "pen", 115, 26, 6, 20, 20],
    ["Pen B1 — Mid Lactation", "حظيرة ب١ — منتصف الحليب", "pen", 75, 48, 6, 20, 20],
    ["Pen B2 — Mid Lactation", "حظيرة ب٢ — منتصف الحليب", "pen", 75, 70, 6, 24, 20],
    ["Pen C1 — Dry Cows", "حظيرة ج١ — جاف", "pen", 45, 4, 30, 20, 18],
    ["Pen C2 — Close-Up", "حظيرة ج٢ — قرب الولادة", "pen", 42, 26, 30, 20, 18],
    ["Pen D — Heifers", "حظيرة د — عشار صغيرة", "pen", 115, 48, 30, 20, 18],
    ["Pen E — Bulls", "حظيرة هـ — طلائق", "pen", 24, 70, 30, 24, 18],
    ["Calf Barn 1", "حظيرة العجول ١", "barn", 88, 4, 52, 26, 16],
    ["Calf Barn 2", "حظيرة العجول ٢", "barn", 88, 34, 52, 26, 16],
    ["Milking Parlor", "صالة الحلب", "milking_parlor", 48, 64, 52, 30, 16],
    ["Feed Store", "مخزن الأعلاف", "feed_store", 0, 4, 72, 28, 14],
    ["Silage Bunker", "بنكر السيلاج", "feed_store", 0, 34, 72, 20, 14],
    ["Veterinary Clinic", "العيادة البيطرية", "clinic", 12, 56, 72, 18, 14],
    ["Quarantine", "الحجر الصحي", "quarantine", 15, 76, 72, 18, 14],
    ["Water Reservoir", "خزان المياه", "water", 0, 4, 90, 44, 8],
    ["Admin Office", "المكتب الإداري", "office", 0, 52, 90, 42, 8],
  ];

  const zones: Zone[] = zoneDefs.map(([name, nameAr, kind, capacity, x, y, w, h], i) => ({
    id: `zone_${i + 1}`,
    farmId: FARM_ID,
    name,
    nameAr,
    kind,
    capacity,
    x,
    y,
    w,
    h,
    shadeCoverPct: kind === "pen" ? Math.round(between(rand, 40, 95)) : undefined,
    hasFans: kind === "pen" || kind === "barn" ? rand() > 0.35 : undefined,
  }));

  const penIds = zones.filter((z) => z.kind === "pen").map((z) => z.id);
  const calfBarns = zones.filter((z) => z.kind === "barn").map((z) => z.id);

  /* --------------------------------- Animals -------------------------------- */
  const animals: Animal[] = [];
  const TOTAL = 617;

  for (let i = 0; i < TOTAL; i++) {
    const r = mulberry32(1000 + i * 7919);
    const seq = i + 1;

    // Herd composition modelled on a real 600-head Egyptian buffalo dairy.
    let kind: "lactating" | "dry" | "pregnant_heifer" | "heifer" | "calf" | "bull";
    const roll = r();
    if (roll < 0.44) kind = "lactating";
    else if (roll < 0.56) kind = "dry";
    else if (roll < 0.64) kind = "pregnant_heifer";
    else if (roll < 0.73) kind = "heifer";
    else if (roll < 0.96) kind = "calf";
    else kind = "bull";

    const sex = kind === "bull" ? "male" : kind === "calf" ? (r() > 0.5 ? "male" : "female") : "female";
    const isCalf = kind === "calf";

    const ageDays = isCalf
      ? Math.round(between(r, 3, 330))
      : kind === "heifer"
        ? Math.round(between(r, 360, 760))
        : kind === "pregnant_heifer"
          ? Math.round(between(r, 700, 980))
          : kind === "bull"
            ? Math.round(between(r, 900, 2600))
            : Math.round(between(r, 1150, 4200));

    const dob = addDays(TODAY, -ageDays);
    const lactationNumber =
      kind === "lactating" || kind === "dry"
        ? clamp(Math.floor((ageDays - 1050) / 430) + 1, 1, 8)
        : 0;

    let milkStatus: Animal["milkStatus"] = "not_applicable";
    let reproStatus: Animal["reproStatus"] = "not_applicable";
    let lastCalvingDate: string | undefined;
    let dryDate: string | undefined;
    let expectedCalvingDate: string | undefined;
    let dim = 0;

    if (kind === "lactating") {
      milkStatus = "lactating";
      dim = Math.round(between(r, 5, 305));
      lastCalvingDate = addDays(TODAY, -dim);
      // ~62% of the milking string is confirmed pregnant again.
      const p = r();
      if (dim > 90 && p < 0.62) {
        reproStatus = "pregnant";
        const daysPregnant = Math.round(between(r, 30, 250));
        expectedCalvingDate = addDays(TODAY, 310 - daysPregnant);
      } else if (dim > 55 && p < 0.82) {
        reproStatus = "inseminated";
      } else {
        reproStatus = dim < 55 ? "fresh" : "open";
      }
    } else if (kind === "dry") {
      milkStatus = "dry";
      reproStatus = "pregnant";
      const daysToCalving = Math.round(between(r, 3, 60));
      expectedCalvingDate = addDays(TODAY, daysToCalving);
      dryDate = addDays(expectedCalvingDate, -60);
      lastCalvingDate = addDays(expectedCalvingDate, -310 - Math.round(between(r, 60, 120)));
    } else if (kind === "pregnant_heifer") {
      milkStatus = "heifer";
      reproStatus = "pregnant";
      expectedCalvingDate = addDays(TODAY, Math.round(between(r, 10, 240)));
    } else if (kind === "heifer") {
      milkStatus = "heifer";
      reproStatus = ageDays > 540 ? (r() > 0.5 ? "inseminated" : "open") : "not_applicable";
    }

    const peak = between(r, 7.5, 15.5) + lactationNumber * 0.35;
    const avgDailyMilkL =
      milkStatus === "lactating" ? round(woodsCurve(dim, peak) * seasonalFactor(TODAY), 1) : 0;

    const weightKg = isCalf
      ? round(38 + ageDays * between(r, 0.55, 0.78), 0)
      : kind === "heifer"
        ? round(between(r, 260, 430), 0)
        : kind === "bull"
          ? round(between(r, 620, 950), 0)
          : round(between(r, 480, 720), 0);

    let penId: string;
    if (isCalf) penId = calfBarns[seq % calfBarns.length];
    else if (kind === "bull") penId = "zone_8";
    else if (kind === "dry") penId = r() > 0.4 ? "zone_5" : "zone_6";
    else if (kind === "heifer" || kind === "pregnant_heifer") penId = "zone_7";
    else penId = avgDailyMilkL > 9 ? penIds[seq % 2] : penIds[2 + (seq % 2)];

    const healthScore = clamp(Math.round(between(r, 68, 100) - (r() > 0.93 ? 25 : 0)), 30, 100);
    const status: Animal["status"] = healthScore < 45 && r() > 0.6 ? "quarantine" : "active";

    const nameIdx = Math.floor(r() * 20);
    animals.push({
      id: `an_${String(seq).padStart(5, "0")}`,
      farmId: FARM_ID,
      tag: `EG-${String(1000 + seq)}`,
      rfid: `982 000${String(100000 + seq * 13).slice(-9)}`,
      microchip: r() > 0.6 ? `MC${String(700000 + seq * 31)}` : undefined,
      name: sex === "male" ? EN_MALE_NAMES[nameIdx % 8] : EN_FEMALE_NAMES[nameIdx],
      nameAr: sex === "male" ? AR_MALE_NAMES[nameIdx % 8] : AR_FEMALE_NAMES[nameIdx],
      sex,
      breed: pick(r, BREEDS),
      bloodline: pick(r, BLOODLINES),
      motherId: r() > 0.35 ? `an_${String(1 + Math.floor(r() * 200)).padStart(5, "0")}` : undefined,
      fatherId: r() > 0.5 ? `an_${String(600 + Math.floor(r() * 17)).padStart(5, "0")}` : undefined,
      dateOfBirth: dob,
      status,
      milkStatus,
      reproStatus,
      penId,
      weightKg,
      bodyConditionScore: round(clamp(between(r, 2.4, 4.3), 1, 5), 1),
      hornStatus: pick(r, ["horned", "horned", "dehorned", "polled"] as const),
      color: pick(r, COLORS),
      temperament: pick(r, ["calm", "calm", "docile", "nervous", "aggressive"] as const),
      healthScore,
      lactationNumber,
      lastCalvingDate,
      dryDate,
      expectedCalvingDate,
      avgDailyMilkL,
      lifetimeMilkL: round(lactationNumber * between(r, 1650, 2600), 0),
      valuation: Math.round(
        (isCalf ? between(r, 12000, 28000) : kind === "bull" ? between(r, 90000, 190000) : between(r, 55000, 130000)) /
          500,
      ) * 500,
      insurance:
        r() > 0.55
          ? {
              provider: pick(r, ["Misr Insurance", "AXA Egypt", "Suez Canal Ins."]),
              policyNo: `POL-${String(40000 + seq)}`,
              coverage: Math.round(between(r, 40000, 120000) / 1000) * 1000,
              expiry: addDays(TODAY, Math.round(between(r, 20, 500))),
            }
          : undefined,
      notes: undefined,
      acquiredAt: r() > 0.8 ? addDays(dob, Math.round(between(r, 200, 800))) : dob,
      acquiredFrom: r() > 0.8 ? "purchased" : "born_on_farm",
      isCalf,
      gpsCollar: r() > 0.7,
    });
  }

  /* -------------------------------- Employees ------------------------------- */
  const empRoles: EmployeeRole[] = [
    "milker", "milker", "milker", "milker", "feeder", "feeder", "cleaner",
    "vet_assistant", "supervisor", "driver", "accountant", "manager",
  ];
  const empEn = [
    "Ahmed Sabry", "Mahmoud Fathy", "Karim Adel", "Youssef Nabil", "Hossam Gamal",
    "Mostafa Selim", "Ibrahim Zaki", "Tarek Mansour", "Amir Rashad", "Sayed Kamal",
    "Nader Hafez", "Ashraf Lotfy", "Ramy Sobhy", "Wael Nagy", "Sherif Osman",
    "Hany Abdel Aziz", "Osama Farid", "Emad Shaker", "Alaa Hamdy", "Mina Boutros",
    "Fatma Hassan", "Nour Ibrahim", "Salma Adly", "Heba Ezzat", "Doaa Refaat",
    "Mariam Nashaat", "Aya Sameh", "Rania Fouad", "Sara Magdy", "Hoda Anwar",
    "Gamal Sedky", "Reda Bakr", "Magdy Shawky", "Sameh Riad", "Atef Zidan",
    "Kholoud Saad", "Basma Tarek", "Nesma Helmy", "Amany Wagdy", "Shaimaa Nabil",
    "Ehab Mounir", "Khaled Roshdy",
  ];
  const empAr = [
    "أحمد صبري", "محمود فتحي", "كريم عادل", "يوسف نبيل", "حسام جمال",
    "مصطفى سليم", "إبراهيم زكي", "طارق منصور", "أمير رشاد", "سيد كمال",
    "نادر حافظ", "أشرف لطفي", "رامي صبحي", "وائل ناجي", "شريف عثمان",
    "هاني عبد العزيز", "أسامة فريد", "عماد شاكر", "علاء حمدي", "مينا بطرس",
    "فاطمة حسن", "نور إبراهيم", "سلمى عدلي", "هبة عزت", "دعاء رفعت",
    "مريم نشأت", "آية سامح", "رانيا فؤاد", "سارة مجدي", "هدى أنور",
    "جمال صدقي", "رضا بكر", "مجدي شوقي", "سامح رياض", "عاطف زيدان",
    "خلود سعد", "بسمة طارق", "نسمة حلمي", "أماني وجدي", "شيماء نبيل",
    "إيهاب منير", "خالد رشدي",
  ];

  const employees: Employee[] = empEn.map((name, i) => {
    const r = mulberry32(5000 + i * 131);
    const role = i === 41 ? "manager" : i === 40 ? "accountant" : empRoles[i % empRoles.length];
    return {
      id: `emp_${String(i + 1).padStart(3, "0")}`,
      farmId: FARM_ID,
      code: `E-${String(100 + i)}`,
      name,
      nameAr: empAr[i],
      role,
      phone: `+20 10${Math.floor(between(r, 10000000, 99999999))}`,
      nationalId: `2${Math.floor(between(r, 10000000000000, 99999999999999))}`,
      hiredAt: addDays(TODAY, -Math.round(between(r, 90, 2900))),
      monthlySalary: Math.round(between(r, 4500, 16000) / 250) * 250,
      shift: pick(r, ["morning", "evening", "rotating", "night"] as const),
      active: r() > 0.06,
      performanceScore: Math.round(between(r, 62, 99)),
      trainings: [
        { name: "Milking hygiene", completedAt: addDays(TODAY, -Math.round(between(r, 30, 600))) },
        ...(r() > 0.5
          ? [{ name: "Animal welfare handling", completedAt: addDays(TODAY, -Math.round(between(r, 30, 400))) }]
          : []),
      ],
      safetyIncidents: r() > 0.85 ? 1 : 0,
    };
  });

  /* -------------------------------- Attendance ------------------------------ */
  const attendance: Attendance[] = [];
  const attendanceDays = rangeDays(TODAY, 30);
  attendanceDays.forEach((date, di) => {
    employees.forEach((e, ei) => {
      if (!e.active) return;
      const r = mulberry32(9000 + di * 97 + ei * 13);
      const roll = r();
      const status: Attendance["status"] =
        roll > 0.94 ? "absent" : roll > 0.88 ? "late" : roll > 0.86 ? "leave" : "present";
      const hours = status === "present" ? round(between(r, 7.5, 9.5), 1) : status === "late" ? round(between(r, 5, 7), 1) : 0;
      attendance.push({
        id: `att_${date}_${e.id}`,
        farmId: FARM_ID,
        employeeId: e.id,
        date,
        clockIn: hours ? (e.shift === "evening" ? "14:05" : "05:12") : undefined,
        clockOut: hours ? (e.shift === "evening" ? "22:40" : "13:48") : undefined,
        status,
        hours,
        overtimeHours: hours > 8.5 ? round(hours - 8.5, 1) : 0,
      });
    });
  });

  /* --------------------------------- Partners ------------------------------- */
  const partnerDefs: Array<[string, string, Partner["kind"]]> = [
    ["Delta Dairy Co.", "شركة دلتا للألبان", "milk_buyer"],
    ["Cairo Fresh Milk", "القاهرة للألبان الطازجة", "milk_buyer"],
    ["El Nasr Cheese Factory", "مصنع النصر للجبن", "milk_buyer"],
    ["Local Market Traders", "تجار السوق المحلي", "milk_buyer"],
    ["Abu Zeid Livestock", "أبو زيد للماشية", "animal_buyer"],
    ["Tanta Cattle Market", "سوق طنطا للماشية", "animal_buyer"],
    ["Green Valley Feeds", "الوادي الأخضر للأعلاف", "supplier"],
    ["Nile Agro Supplies", "النيل للمستلزمات الزراعية", "supplier"],
    ["PharmaVet Egypt", "فارما فيت مصر", "supplier"],
    ["Delta Machinery Parts", "دلتا لقطع الغيار", "supplier"],
    ["Kafr El Sheikh Fuel", "كفر الشيخ للوقود", "supplier"],
    ["Dr. Sameh Abdel Rahman", "د. سامح عبد الرحمن", "veterinarian"],
    ["Dr. Laila Mounir", "د. ليلى منير", "veterinarian"],
    ["Vet Clinic Delta", "عيادة دلتا البيطرية", "veterinarian"],
  ];
  const partners: Partner[] = partnerDefs.map(([name, nameAr, kind], i) => {
    const r = mulberry32(3000 + i * 271);
    return {
      id: `pt_${String(i + 1).padStart(3, "0")}`,
      farmId: FARM_ID,
      kind,
      name,
      nameAr,
      contactName: pick(r, empEn),
      phone: `+20 12${Math.floor(between(r, 10000000, 99999999))}`,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      address: pick(r, ["Kafr El Sheikh", "Tanta", "Cairo", "Damanhur", "Mansoura"]),
      // Sign convention: positive = they owe us (buyers), negative = we owe them
      // (suppliers and vets on 30-day terms).
      balance:
        Math.round(between(r, 0, 320000) / 100) *
        100 *
        (kind === "supplier" || kind === "veterinarian" ? -1 : 1),
      creditLimit: kind === "milk_buyer" ? 500000 : undefined,
      rating: round(between(r, 3.2, 5), 1),
      since: addDays(TODAY, -Math.round(between(r, 200, 2800))),
    };
  });

  /* ----------------------------------- Feed --------------------------------- */
  const feedDefs: Array<[string, string, FeedItem["category"], FeedItem["unit"], number, number, number, number, number]> =
    [
      ["Corn silage", "سيلاج الذرة", "silage", "ton", 182, 60, 2600, 32, 1.05],
      ["Berseem (fresh)", "برسيم أخضر", "roughage", "ton", 44, 20, 1800, 18, 0.95],
      ["Rice straw", "قش الأرز", "roughage", "ton", 96, 30, 900, 92, 0.42],
      ["Wheat bran", "ردة قمح", "concentrate", "ton", 28, 15, 9500, 88, 1.7],
      ["Soybean meal 44%", "كسب فول الصويا", "concentrate", "ton", 16, 10, 24500, 89, 2.1],
      ["Cottonseed cake", "كسب بذرة القطن", "concentrate", "ton", 21, 12, 16800, 90, 1.9],
      ["Yellow corn", "ذرة صفراء", "concentrate", "ton", 34, 20, 13200, 87, 1.95],
      ["Molasses", "مولاس", "supplement", "ton", 9, 5, 8200, 75, 2.4],
      ["Limestone", "حجر جيري", "mineral", "kg", 2400, 800, 4, 99, 0],
      ["Dicalcium phosphate", "فوسفات ثنائي الكالسيوم", "mineral", "kg", 640, 300, 28, 99, 0],
      ["Mineral premix", "بريمكس معدني", "mineral", "kg", 380, 200, 46, 98, 0],
      ["Sodium bicarbonate", "بيكربونات الصوديوم", "supplement", "kg", 210, 150, 22, 99, 0],
      ["Bypass fat", "دهون محمية", "supplement", "kg", 480, 250, 95, 99, 0],
      ["Calf starter", "بادئ العجول", "concentrate", "kg", 1750, 600, 19, 90, 3.1],
    ];
  const feedItems: FeedItem[] = feedDefs.map(
    ([name, nameAr, category, unit, stock, reorder, cost, dm, energy], i) => {
      const r = mulberry32(7000 + i * 53);
      return {
        id: `feed_${String(i + 1).padStart(3, "0")}`,
        farmId: FARM_ID,
        name,
        nameAr,
        category,
        unit,
        stock: round(stock * between(r, 0.55, 1.15), 1),
        reorderLevel: reorder,
        costPerUnit: cost,
        supplierId: category === "mineral" || category === "supplement" ? "pt_008" : "pt_007",
        expiresAt: r() > 0.5 ? addDays(TODAY, Math.round(between(r, 12, 400))) : undefined,
        dryMatterPct: dm,
        proteinPct: round(between(r, 6, 44), 1),
        energyMcalPerKg: energy,
      };
    },
  );

  const rations: FeedRation[] = [
    {
      id: "ration_1",
      farmId: FARM_ID,
      name: "High-yield lactating TMR",
      nameAr: "خلطة كاملة للحلابات عالية الإنتاج",
      targetGroup: "lactating",
      components: [
        { feedItemId: "feed_001", kgPerHead: 22 },
        { feedItemId: "feed_002", kgPerHead: 12 },
        { feedItemId: "feed_004", kgPerHead: 3.5 },
        { feedItemId: "feed_005", kgPerHead: 2.2 },
        { feedItemId: "feed_007", kgPerHead: 3 },
        { feedItemId: "feed_011", kgPerHead: 0.15 },
        { feedItemId: "feed_013", kgPerHead: 0.3 },
      ],
      costPerHead: 155,
    },
    {
      id: "ration_2",
      farmId: FARM_ID,
      name: "Dry cow ration",
      nameAr: "علف الجاف",
      targetGroup: "dry",
      components: [
        { feedItemId: "feed_003", kgPerHead: 6 },
        { feedItemId: "feed_001", kgPerHead: 10 },
        { feedItemId: "feed_004", kgPerHead: 1.5 },
        { feedItemId: "feed_011", kgPerHead: 0.1 },
      ],
      costPerHead: 92,
    },
    {
      id: "ration_3",
      farmId: FARM_ID,
      name: "Calf starter program",
      nameAr: "برنامج بادئ العجول",
      targetGroup: "calves",
      components: [
        { feedItemId: "feed_014", kgPerHead: 1.6 },
        { feedItemId: "feed_002", kgPerHead: 2 },
      ],
      costPerHead: 48,
    },
    {
      id: "ration_4",
      farmId: FARM_ID,
      name: "Heifer growing ration",
      nameAr: "علف نمو العشار",
      targetGroup: "heifers",
      components: [
        { feedItemId: "feed_001", kgPerHead: 14 },
        { feedItemId: "feed_004", kgPerHead: 2 },
        { feedItemId: "feed_006", kgPerHead: 1.2 },
      ],
      costPerHead: 108,
    },
    {
      id: "ration_5",
      farmId: FARM_ID,
      name: "Bull maintenance",
      nameAr: "علف صيانة الطلائق",
      targetGroup: "bulls",
      components: [
        { feedItemId: "feed_003", kgPerHead: 8 },
        { feedItemId: "feed_007", kgPerHead: 2.5 },
      ],
      costPerHead: 86,
    },
  ];

  const feedConsumption: FeedConsumption[] = [];
  rangeDays(TODAY, 90).forEach((date, di) => {
    zones
      .filter((z) => z.kind === "pen" || z.kind === "barn")
      .forEach((z, zi) => {
        const r = mulberry32(11000 + di * 89 + zi * 17);
        const heads = animals.filter((a) => a.penId === z.id && a.status !== "dead").length;
        if (!heads) return;
        const ration =
          z.kind === "barn" ? rations[2] : z.id === "zone_5" || z.id === "zone_6" ? rations[1] : z.id === "zone_7" ? rations[3] : z.id === "zone_8" ? rations[4] : rations[0];
        const kgPerHead = ration.components.reduce((s, c) => s + c.kgPerHead, 0);
        const kg = round(heads * kgPerHead * between(r, 0.93, 1.07), 1);
        feedConsumption.push({
          id: `fc_${date}_${z.id}`,
          farmId: FARM_ID,
          date,
          zoneId: z.id,
          rationId: ration.id,
          kg,
          cost: Math.round(heads * ration.costPerHead * between(r, 0.95, 1.06)),
          heads,
        });
      });
  });

  /* -------------------------------- Inventory ------------------------------- */
  const invDefs: Array<[string, string, InventoryItem["category"], string, number, number, number]> = [
    ["Oxytetracycline 20%", "أوكسي تتراسيكلين ٢٠٪", "medicine", "vial", 42, 20, 210],
    ["Penicillin-Streptomycin", "بنسلين-ستربتومايسين", "medicine", "vial", 18, 25, 185],
    ["Calcium borogluconate", "بوروجلوكونات الكالسيوم", "medicine", "bottle", 64, 30, 95],
    ["FMD vaccine (trivalent)", "لقاح الحمى القلاعية", "medicine", "dose", 310, 200, 78],
    ["Brucella RB51 vaccine", "لقاح البروسيلا", "medicine", "dose", 120, 100, 140],
    ["Ivermectin injectable", "إيفرمكتين حقن", "medicine", "vial", 9, 15, 260],
    ["Intramammary tube (dry)", "أنابيب الضرع للتجفيف", "medicine", "tube", 240, 150, 65],
    ["Ketosis drench", "دواء الكيتوزيس", "medicine", "bottle", 27, 20, 120],
    ["Teat dip iodine", "مطهر الحلمات", "cleaning", "liter", 88, 40, 155],
    ["Alkaline detergent", "منظف قلوي", "cleaning", "liter", 120, 60, 92],
    ["Disinfectant (QAC)", "مطهر رباعي الأمونيوم", "cleaning", "liter", 74, 50, 110],
    ["Milking liners", "أكواب الحلب", "parts", "set", 22, 12, 780],
    ["Vacuum pump belt", "سير مضخة التفريغ", "parts", "unit", 6, 4, 950],
    ["Milk filter socks", "فلاتر اللبن", "consumables", "box", 31, 20, 340],
    ["Diesel", "سولار", "fuel", "liter", 3200, 1500, 13],
    ["Gasoline 92", "بنزين ٩٢", "fuel", "liter", 480, 300, 15],
    ["Ear tags (blank)", "أقراط ترقيم", "consumables", "pack", 14, 10, 420],
    ["RFID tags", "أقراط RFID", "consumables", "pack", 7, 8, 1850],
    ["Gloves (nitrile)", "قفازات نيتريل", "consumables", "box", 26, 15, 190],
    ["Hoof trimming knife", "سكين تقليم الحوافر", "tools", "unit", 5, 3, 480],
    ["Portable milk scale", "ميزان لبن محمول", "equipment", "unit", 3, 2, 12500],
    ["AI gun", "مسدس تلقيح", "equipment", "unit", 4, 2, 2400],
    ["LN2 semen tank", "خزان نيتروجين", "equipment", "unit", 2, 1, 48000],
    ["Feed mixer wagon spare", "قطع غيار عربة الخلط", "parts", "unit", 3, 2, 6800],
  ];
  const inventory: InventoryItem[] = invDefs.map(
    ([name, nameAr, category, unit, stock, reorder, cost], i) => {
      const r = mulberry32(13000 + i * 61);
      return {
        id: `inv_${String(i + 1).padStart(3, "0")}`,
        farmId: FARM_ID,
        sku: `SKU-${String(2000 + i)}`,
        name,
        nameAr,
        category,
        unit,
        stock,
        reorderLevel: reorder,
        unitCost: cost,
        supplierId: category === "medicine" ? "pt_009" : category === "fuel" ? "pt_011" : "pt_010",
        expiresAt:
          category === "medicine"
            ? addDays(TODAY, Math.round(between(r, -10, 420)))
            : undefined,
        location: pick(r, ["Store A / Shelf 2", "Clinic fridge", "Store B", "Fuel yard"]),
        batchNo: `B${Math.floor(between(r, 10000, 99999))}`,
      };
    },
  );

  const movements: StockMovement[] = [];
  rangeDays(TODAY, 45).forEach((date, di) => {
    const r = mulberry32(15000 + di * 37);
    const count = Math.floor(between(r, 1, 5));
    for (let k = 0; k < count; k++) {
      const item = pick(r, inventory);
      movements.push({
        id: `mv_${date}_${k}`,
        farmId: FARM_ID,
        itemId: item.id,
        date,
        kind: r() > 0.7 ? "in" : r() > 0.1 ? "out" : "waste",
        quantity: Math.round(between(r, 1, 40)),
        reference: r() > 0.5 ? `PO-${Math.floor(between(r, 1000, 9999))}` : undefined,
      });
    }
  });

  /* --------------------------------- Health --------------------------------- */
  const diseases: Disease[] = [
    "mastitis", "mastitis", "mastitis", "lameness", "lameness", "ketosis",
    "milk_fever", "pneumonia", "diarrhea", "metritis", "parasites",
  ];
  const vaccines = ["FMD trivalent", "Brucella RB51", "HS (Haemorrhagic Septicaemia)", "Anthrax", "Rabies", "Clostridial 8-way"];
  const health: HealthEvent[] = [];
  let hIdx = 0;

  animals.forEach((a, ai) => {
    const r = mulberry32(17000 + ai * 149);
    // Vaccination programme — every animal carries a rolling schedule.
    const vaccineCount = a.isCalf ? 2 : 3;
    for (let v = 0; v < vaccineCount; v++) {
      const daysAgo = Math.round(between(r, 10, 330));
      health.push({
        id: `he_${String(++hIdx).padStart(6, "0")}`,
        farmId: FARM_ID,
        animalId: a.id,
        type: "vaccination",
        date: addDays(TODAY, -daysAgo),
        vaccine: vaccines[(ai + v) % vaccines.length],
        cost: Math.round(between(r, 60, 220)),
        nextDueDate: addDays(TODAY, 180 - daysAgo),
        vetName: pick(r, ["Dr. Sameh Abdel Rahman", "Dr. Laila Mounir"]),
      });
    }
    // Clinical events — mastitis dominates, as it does in real buffalo dairies.
    const eventCount = a.milkStatus === "lactating" ? (r() > 0.45 ? 2 : 1) : r() > 0.75 ? 1 : 0;
    for (let e = 0; e < eventCount; e++) {
      const disease = pick(r, diseases);
      const date = addDays(TODAY, -Math.round(between(r, 1, 300)));
      const ongoing = diffDays(TODAY, date) < 9 && r() > 0.4;
      health.push({
        id: `he_${String(++hIdx).padStart(6, "0")}`,
        farmId: FARM_ID,
        animalId: a.id,
        type: "diagnosis",
        date,
        disease,
        medication: pick(r, ["Oxytetracycline 20%", "Penicillin-Strep", "Calcium borogluconate", "Ivermectin"]),
        dosage: `${Math.round(between(r, 10, 40))} ml IM × ${Math.round(between(r, 3, 5))} d`,
        vitals: {
          temperatureC: round(between(r, 38.2, 41.2), 1),
          heartRate: Math.round(between(r, 52, 96)),
          respiration: Math.round(between(r, 16, 42)),
        },
        vetName: pick(r, ["Dr. Sameh Abdel Rahman", "Dr. Laila Mounir"]),
        cost: Math.round(between(r, 150, 1800)),
        withdrawalUntil: addDays(date, Math.round(between(r, 3, 8))),
        // ~4% of clinical cases are fatal — roughly a 5%/yr herd mortality rate,
        // which is what a well-run Egyptian buffalo dairy actually runs at.
        outcome: ongoing ? "ongoing" : r() > 0.09 ? "recovered" : r() > 0.45 ? "chronic" : "died",
        isolation: ongoing && r() > 0.6,
        notes: undefined,
      });
    }
  });

  // Fatalities feed back into herd status so the two views never disagree.
  const deceased = new Set(health.filter((h) => h.outcome === "died").map((h) => h.animalId));
  animals.forEach((a) => {
    if (deceased.has(a.id)) {
      a.status = "dead";
      a.milkStatus = "not_applicable";
      a.reproStatus = "not_applicable";
      a.avgDailyMilkL = 0;
    }
  });

  /* -------------------------------- Breeding -------------------------------- */
  const breeding: BreedingEvent[] = [];
  let bIdx = 0;
  const bulls = animals.filter((a) => a.sex === "male" && !a.isCalf);

  animals
    .filter((a) => a.sex === "female" && !a.isCalf)
    .forEach((a, ai) => {
      const r = mulberry32(19000 + ai * 211);
      if (a.lastCalvingDate) {
        breeding.push({
          id: `br_${String(++bIdx).padStart(6, "0")}`,
          farmId: FARM_ID,
          animalId: a.id,
          type: "calving",
          date: a.lastCalvingDate,
          outcome: r() > 0.94 ? (r() > 0.5 ? "stillbirth" : "twins") : "live",
          notes: undefined,
        });
      }
      if (a.reproStatus === "pregnant" || a.reproStatus === "inseminated") {
        const aiDate = a.expectedCalvingDate
          ? addDays(a.expectedCalvingDate, -310)
          : addDays(TODAY, -Math.round(between(r, 5, 40)));
        breeding.push({
          id: `br_${String(++bIdx).padStart(6, "0")}`,
          farmId: FARM_ID,
          animalId: a.id,
          type: r() > 0.15 ? "ai" : "natural_mating",
          date: aiDate,
          sireId: pick(r, bulls)?.id,
          semenBatch: `STR-${Math.floor(between(r, 1000, 9999))}`,
          technician: pick(r, ["Ahmed Sabry", "Dr. Laila Mounir", "Amir Rashad"]),
        });
        breeding.push({
          id: `br_${String(++bIdx).padStart(6, "0")}`,
          farmId: FARM_ID,
          animalId: a.id,
          type: "heat",
          date: addDays(aiDate, -1),
        });

        // Failed services before the one that took. Buffalo run ~45% conception
        // per service, so most cows are bred twice and plenty three times —
        // without these the conception rate reads like science fiction.
        const repeats = r() > 0.42 ? (r() > 0.55 ? 2 : 1) : 0;
        for (let k = 1; k <= repeats; k++) {
          const failedDate = addDays(aiDate, -21 * k);
          breeding.push({
            id: `br_${String(++bIdx).padStart(6, "0")}`,
            farmId: FARM_ID,
            animalId: a.id,
            type: "heat",
            date: addDays(failedDate, -1),
          });
          breeding.push({
            id: `br_${String(++bIdx).padStart(6, "0")}`,
            farmId: FARM_ID,
            animalId: a.id,
            type: "ai",
            date: failedDate,
            sireId: pick(r, bulls)?.id,
            semenBatch: `STR-${Math.floor(between(r, 1000, 9999))}`,
            technician: pick(r, ["Ahmed Sabry", "Dr. Laila Mounir", "Amir Rashad"]),
          });
          breeding.push({
            id: `br_${String(++bIdx).padStart(6, "0")}`,
            farmId: FARM_ID,
            animalId: a.id,
            type: "pregnancy_check",
            date: addDays(failedDate, 45),
            result: "open",
          });
        }

        if (a.reproStatus === "pregnant") {
          breeding.push({
            id: `br_${String(++bIdx).padStart(6, "0")}`,
            farmId: FARM_ID,
            animalId: a.id,
            type: "pregnancy_check",
            date: addDays(aiDate, 45),
            result: "pregnant",
          });
        }
      }
      // Open cows still cycle — the heat log is the widest part of the funnel.
      if (a.reproStatus === "open") {
        const observed = 1 + Math.floor(r() * 2);
        for (let k = 0; k < observed; k++) {
          breeding.push({
            id: `br_${String(++bIdx).padStart(6, "0")}`,
            farmId: FARM_ID,
            animalId: a.id,
            type: "heat",
            date: addDays(TODAY, -Math.round(between(r, 2, 63))),
          });
        }
      }

      if (r() > 0.97) {
        breeding.push({
          id: `br_${String(++bIdx).padStart(6, "0")}`,
          farmId: FARM_ID,
          animalId: a.id,
          type: "abortion",
          date: addDays(TODAY, -Math.round(between(r, 20, 300))),
          notes: "Suspected brucellosis screen — negative",
        });
      }
    });

  const semen: SemenStraw[] = Array.from({ length: 10 }, (_, i) => {
    const r = mulberry32(21000 + i * 313);
    return {
      id: `sem_${i + 1}`,
      farmId: FARM_ID,
      batch: `STR-${2000 + i * 37}`,
      sireName: pick(r, ["Murrah King", "Delta Champion", "Ravi Star", "Nile Titan", "Baladi Prime", "Jafar Elite"]),
      sireBreed: pick(r, BREEDS),
      quantity: Math.round(between(r, 4, 140)),
      collectedAt: addDays(TODAY, -Math.round(between(r, 60, 900))),
      expiresAt: addDays(TODAY, Math.round(between(r, 30, 1200))),
      tankId: `TANK-${1 + (i % 2)}`,
      costPerStraw: Math.round(between(r, 250, 1400) / 50) * 50,
      conceptionRate: Math.round(between(r, 38, 72)),
    };
  });

  /* ---------------------------------- Milk ---------------------------------- */
  // Two full years so the year-on-year comparisons have something to compare to.
  const milkDaily: DailyMilkPoint[] = rangeDays(TODAY, 730).map((date, di) => {
    const r = mulberry32(23000 + di * 401);
    const lactating = animals.filter((a) => a.milkStatus === "lactating");
    // Herd size drifts over the year — roughly ±8% around today's milking string.
    const drift = 1 + Math.sin((di / 365) * Math.PI * 2) * 0.08;
    const milkingCows = Math.round(lactating.length * drift);
    const perCow = 8.6 * seasonalFactor(date) * (1 + noise(r, 0.06));
    const totalL = round(milkingCows * perCow, 0);
    const morningL = round(totalL * between(r, 0.54, 0.58), 0);
    return {
      date,
      morningL,
      eveningL: round(totalL - morningL, 0),
      totalL,
      rejectedL: round(totalL * between(r, 0, 0.018), 0),
      avgFat: round(between(r, 6.4, 7.6), 2),
      avgProtein: round(between(r, 3.9, 4.6), 2),
      milkingCows,
    };
  });

  /* --------------------------------- Finance -------------------------------- */
  const transactions: Transaction[] = [];
  let tIdx = 0;
  // Buffalo milk is a premium product in Egypt — roughly 7% fat against 3.5%
  // for cow milk, and the cheese trade pays for it.
  const milkPrice = 38;
  const liveHeadCount = animals.filter((a) => a.status !== "dead").length;

  milkDaily.forEach((day, di) => {
    const r = mulberry32(27000 + di * 577);
    const sold = day.totalL - day.rejectedL;
    transactions.push({
      id: `tx_${String(++tIdx).padStart(6, "0")}`,
      farmId: FARM_ID,
      date: day.date,
      kind: "income",
      category: "milk_sales",
      amount: Math.round(sold * milkPrice * between(r, 0.97, 1.05)),
      description: `Milk delivery ${round(sold, 0)} L`,
      counterpartyId: pick(r, ["pt_001", "pt_002", "pt_003", "pt_004"]),
      paymentMethod: r() > 0.3 ? "bank" : "cash",
    });

    // Whole-herd feed bill: milkers on the full TMR, everyone else on
    // maintenance rations, blended to ~78 EGP/head/day.
    const feedCost = Math.round(
      (day.milkingCows * 155 + (liveHeadCount - day.milkingCows) * 62) * between(r, 0.95, 1.06),
    );
    transactions.push({
      id: `tx_${String(++tIdx).padStart(6, "0")}`,
      farmId: FARM_ID,
      date: day.date,
      kind: "expense",
      category: "feed",
      amount: feedCost,
      description: "Daily TMR + roughage",
      counterpartyId: "pt_007",
      paymentMethod: "credit",
    });

    if (di % 7 === 0) {
      (["medicine", "fuel", "utilities", "maintenance", "veterinary", "transport"] as const).forEach(
        (category, ci) => {
          transactions.push({
            id: `tx_${String(++tIdx).padStart(6, "0")}`,
            farmId: FARM_ID,
            date: day.date,
            kind: "expense",
            category,
            amount: Math.round(between(r, 3000, 19000)),
            description: `Weekly ${category.replace("_", " ")}`,
            counterpartyId: pick(r, partners).id,
            paymentMethod: ci % 2 ? "cash" : "bank",
          });
        },
      );
    }
    if (day.date.endsWith("-28")) {
      transactions.push({
        id: `tx_${String(++tIdx).padStart(6, "0")}`,
        farmId: FARM_ID,
        date: day.date,
        kind: "expense",
        category: "labor",
        amount: employees.filter((e) => e.active).reduce((s, e) => s + e.monthlySalary, 0),
        description: "Monthly payroll",
        paymentMethod: "bank",
      });
    }
    if (di % 23 === 0) {
      transactions.push({
        id: `tx_${String(++tIdx).padStart(6, "0")}`,
        farmId: FARM_ID,
        date: day.date,
        kind: "income",
        category: "animal_sales",
        amount: Math.round(between(r, 45000, 210000)),
        description: "Livestock sale",
        counterpartyId: pick(r, ["pt_005", "pt_006"]),
        paymentMethod: "cash",
      });
    }
    if (di % 31 === 0) {
      transactions.push({
        id: `tx_${String(++tIdx).padStart(6, "0")}`,
        farmId: FARM_ID,
        date: day.date,
        kind: "income",
        category: "manure_sales",
        amount: Math.round(between(r, 8000, 26000)),
        description: "Composted manure",
        paymentMethod: "cash",
      });
    }
  });

  const invoices: Invoice[] = Array.from({ length: 18 }, (_, i) => {
    const r = mulberry32(29000 + i * 149);
    const issuedAt = addDays(TODAY, -Math.round(between(r, 0, 120)));
    const total = Math.round(between(r, 60000, 900000));
    const paidAmount = r() > 0.4 ? total : Math.round(total * between(r, 0, 0.8));
    const dueAt = addDays(issuedAt, 30);
    return {
      id: `inv_no_${i + 1}`,
      farmId: FARM_ID,
      number: `INV-2026-${String(100 + i)}`,
      customerId: pick(r, partners.filter((p) => p.kind !== "supplier")).id,
      issuedAt,
      dueAt,
      lines: [
        { description: "Raw buffalo milk (L)", qty: Math.round(between(r, 2000, 40000)), unitPrice: milkPrice },
      ],
      paidAmount,
      status:
        paidAmount >= total
          ? "paid"
          : diffDays(TODAY, dueAt) > 0
            ? "overdue"
            : paidAmount > 0
              ? "partial"
              : "sent",
    };
  });

  /* ---------------------------------- Tasks --------------------------------- */
  const taskDefs: Array<[string, string, FarmTask["category"], FarmTask["priority"]]> = [
    ["Morning milking — Parlor A", "حلابة الصباح — صالة أ", "milking", "critical"],
    ["Evening milking — Parlor A", "حلابة المساء — صالة أ", "milking", "critical"],
    ["Distribute TMR to Pens A1–B2", "توزيع الخلطة للحظائر أ١–ب٢", "feeding", "high"],
    ["Calf milk feeding (3×)", "رضاعة العجول ٣ مرات", "feeding", "high"],
    ["Clean milking parlor & lines", "تنظيف صالة الحلب والخطوط", "cleaning", "high"],
    ["FMD vaccination batch 3", "تطعيم الحمى القلاعية دفعة ٣", "health", "high"],
    ["Pregnancy check — 12 head", "فحص الحمل — ١٢ رأس", "breeding", "medium"],
    ["Hoof trimming — Pen B1", "تقليم الحوافر — حظيرة ب١", "health", "medium"],
    ["Heat detection round", "جولة رصد الشياع", "breeding", "high"],
    ["Silage bunker inspection", "فحص بنكر السيلاج", "maintenance", "low"],
    ["Water trough cleaning", "تنظيف أحواض الشرب", "cleaning", "medium"],
    ["Generator fuel top-up", "تعبئة وقود المولد", "maintenance", "medium"],
    ["Weigh calves — Barn 1", "وزن العجول — حظيرة ١", "health", "low"],
    ["Record milk quality samples", "تسجيل عينات جودة اللبن", "admin", "medium"],
    ["Vacuum pump service", "صيانة مضخة التفريغ", "maintenance", "high"],
    ["Restock teat dip", "إعادة تعبئة مطهر الحلمات", "admin", "low"],
  ];
  const tasks: FarmTask[] = [];
  let tkIdx = 0;
  rangeDays(addDays(TODAY, 3), 10).forEach((date, di) => {
    taskDefs.forEach(([title, titleAr, category, priority], i) => {
      const r = mulberry32(31000 + di * 71 + i * 29);
      if (r() > 0.72 && !["milking", "feeding"].includes(category)) return;
      const past = diffDays(TODAY, date) > 0;
      const status: FarmTask["status"] = past
        ? r() > 0.12
          ? "done"
          : "missed"
        : date === TODAY
          ? r() > 0.55
            ? "done"
            : r() > 0.5
              ? "in_progress"
              : "todo"
          : "todo";
      tasks.push({
        id: `task_${String(++tkIdx).padStart(5, "0")}`,
        farmId: FARM_ID,
        title,
        titleAr,
        category,
        priority,
        status,
        dueAt: `${date}T${category === "milking" ? (i === 0 ? "05:00" : "16:30") : "09:00"}:00`,
        assigneeId: pick(r, employees.filter((e) => e.active)).id,
        // Location has to make sense: nobody milks in the quarantine pen.
        zoneId: pick(
          r,
          zones.filter((z) =>
            category === "milking"
              ? z.kind === "milking_parlor"
              : category === "admin"
                ? z.kind === "office"
                : category === "maintenance"
                  ? z.kind !== "pen" && z.kind !== "quarantine"
                  : z.kind === "pen" || z.kind === "barn",
          ),
        )?.id,
        recurrence: ["milking", "feeding", "cleaning"].includes(category) ? "daily" : "none",
        completedAt: status === "done" ? `${date}T11:20:00` : undefined,
      });
    });
  });

  /* --------------------------------- Weather -------------------------------- */
  const wRand = mulberry32(37000);
  const baseTemp = 34 + noise(wRand, 3);
  const humidity = 58 + noise(wRand, 12);
  const thiOf = (t: number, h: number) => round(0.8 * t + (h / 100) * (t - 14.4) + 46.4, 1);
  const thiNow = thiOf(baseTemp, humidity);
  const weather: WeatherNow = {
    temperatureC: round(baseTemp, 1),
    humidityPct: Math.round(humidity),
    windKph: round(between(wRand, 4, 22), 1),
    condition: baseTemp > 33 ? "hot" : "clear",
    thi: thiNow,
    heatStress: thiNow >= 84 ? "severe" : thiNow >= 78 ? "moderate" : thiNow >= 72 ? "mild" : "none",
    forecast: rangeDays(addDays(TODAY, 6), 7).map((date, i) => {
      const r = mulberry32(37100 + i * 13);
      const maxC = round(baseTemp + noise(r, 4), 1);
      const h = Math.round(clamp(humidity + noise(r, 15), 25, 92));
      return {
        date,
        minC: round(maxC - between(r, 8, 13), 1),
        maxC,
        humidityPct: h,
        thi: thiOf(maxC, h),
        condition: maxC > 36 ? "hot" : r() > 0.85 ? "dust" : "clear",
      };
    }),
  };

  /* -------------------------------- Utilities ------------------------------- */
  const utilities: UtilityReading[] = rangeDays(TODAY, 90).map((date, di) => {
    const r = mulberry32(41000 + di * 83);
    const waterM3 = round(between(r, 78, 132), 1);
    const electricityKwh = round(between(r, 1400, 2600), 0);
    const dieselL = round(between(r, 60, 220), 0);
    const gasM3 = round(between(r, 20, 60), 0);
    // More solar mid-day / summer; a rough daily generation figure.
    const solarKwh = round(between(r, 300, 900), 0);
    return {
      date,
      waterM3,
      electricityKwh,
      dieselL,
      gasM3,
      solarKwh,
      outageMinutes: r() > 0.82 ? Math.round(between(r, 10, 180)) : 0,
      // 0.45 kg CO2e/kWh grid factor + 2.68 kg/L diesel + enteric methane proxy.
      co2eKg: round(electricityKwh * 0.45 + dieselL * 2.68 + animals.length * 11.5, 0),
    };
  });

  /* --------------------------------- Alerts --------------------------------- */
  const lowStock = inventory.filter((i) => i.stock <= i.reorderLevel);
  const expiring = inventory.filter(
    (i) => i.expiresAt && diffDays(i.expiresAt, TODAY) <= 30 && diffDays(i.expiresAt, TODAY) >= -30,
  );
  const dueCalvings = animals.filter(
    (a) => a.expectedCalvingDate && diffDays(a.expectedCalvingDate, TODAY) <= 7 && diffDays(a.expectedCalvingDate, TODAY) >= 0,
  );
  const sickNow = health.filter((h) => h.outcome === "ongoing");

  const alerts: Alert[] = [
    {
      id: "al_1",
      farmId: FARM_ID,
      severity: weather.heatStress === "severe" ? "critical" : "warning",
      category: "weather",
      title: `Heat stress ${weather.heatStress} — THI ${weather.thi}`,
      titleAr: `إجهاد حراري ${weather.heatStress === "severe" ? "شديد" : "متوسط"} — مؤشر ${weather.thi}`,
      body: "Run parlor fans and misters from 11:00. Expect a 6–9% dip in evening yield.",
      bodyAr: "شغّل المراوح والرذاذ من الساعة ١١ صباحًا. متوقع انخفاض ٦–٩٪ في حليب المساء.",
      createdAt: `${TODAY}T06:10:00`,
      read: false,
      href: "/analytics",
      channels: ["push", "in_app"],
    },
    {
      id: "al_2",
      farmId: FARM_ID,
      severity: "critical",
      category: "health",
      title: `${sickNow.length} animals under active treatment`,
      titleAr: `${sickNow.length} حيوان تحت العلاج النشط`,
      body: "Mastitis cluster detected in Pen A2 — 3 new cases in 6 days.",
      bodyAr: "تجمع حالات التهاب ضرع في حظيرة أ٢ — ٣ حالات جديدة خلال ٦ أيام.",
      createdAt: `${TODAY}T05:40:00`,
      read: false,
      href: "/health",
      channels: ["push", "sms", "in_app"],
    },
    {
      id: "al_3",
      farmId: FARM_ID,
      severity: "warning",
      category: "breeding",
      title: `${dueCalvings.length} calvings expected this week`,
      titleAr: `${dueCalvings.length} ولادة متوقعة هذا الأسبوع`,
      body: "Move close-up cows to the maternity pen and prepare colostrum stock.",
      bodyAr: "انقل الأبقار قرب الولادة إلى حظيرة الولادة وجهّز مخزون اللبأ.",
      createdAt: `${TODAY}T05:00:00`,
      read: false,
      href: "/breeding",
      channels: ["push", "in_app"],
    },
    {
      id: "al_4",
      farmId: FARM_ID,
      severity: "warning",
      category: "inventory",
      title: `${lowStock.length} items below reorder level`,
      titleAr: `${lowStock.length} صنف تحت حد إعادة الطلب`,
      body: lowStock.slice(0, 3).map((i) => i.name).join(", "),
      bodyAr: lowStock.slice(0, 3).map((i) => i.nameAr).join("، "),
      createdAt: addDays(TODAY, -1) + "T18:20:00",
      read: false,
      href: "/inventory",
      channels: ["email", "in_app"],
    },
    {
      id: "al_5",
      farmId: FARM_ID,
      severity: "warning",
      category: "inventory",
      title: `${expiring.length} medicines expiring within 30 days`,
      titleAr: `${expiring.length} دواء ينتهي خلال ٣٠ يومًا`,
      body: "Use-first list generated. Check the clinic fridge batch numbers.",
      bodyAr: "تم إنشاء قائمة الاستخدام أولًا. راجع أرقام التشغيلات في ثلاجة العيادة.",
      createdAt: addDays(TODAY, -1) + "T09:05:00",
      read: true,
      href: "/inventory",
      channels: ["in_app"],
    },
    {
      id: "al_6",
      farmId: FARM_ID,
      severity: "info",
      category: "milk",
      title: "Evening collection recorded — 2,481 L",
      titleAr: "تم تسجيل تجميع المساء — ٢٤٨١ لتر",
      body: "Delta Dairy truck departed 19:42. Tank temperature 3.9°C.",
      bodyAr: "شاحنة دلتا غادرت ١٩:٤٢. حرارة التانك ٣.٩ درجة.",
      createdAt: addDays(TODAY, -1) + "T19:45:00",
      read: true,
      href: "/milk",
      channels: ["in_app"],
    },
  ];

  const assets: Asset[] = [
    { id: "asset_land", farmId: FARM_ID, name: "Farm land (12 feddan)", nameAr: "أرض المزرعة (12 فدان)", category: "land", acquiredDate: "2016-02-01", cost: 6_000_000, status: "active" },
    { id: "asset_barn", farmId: FARM_ID, name: "Main barn", nameAr: "الحظيرة الرئيسية", category: "building", acquiredDate: "2018-06-15", cost: 1_800_000, usefulLifeYears: 25, salvageValue: 200_000, status: "active" },
    { id: "asset_parlor", farmId: FARM_ID, name: "Milking parlor", nameAr: "صالة الحلابة", category: "building", acquiredDate: "2019-09-01", cost: 900_000, usefulLifeYears: 20, salvageValue: 80_000, status: "active" },
    { id: "asset_milksys", farmId: FARM_ID, name: "Milking system", nameAr: "نظام الحلابة", category: "machine", acquiredDate: "2021-03-20", cost: 650_000, usefulLifeYears: 10, salvageValue: 50_000, status: "active" },
    { id: "asset_mixer", farmId: FARM_ID, name: "Feed mixer wagon", nameAr: "عربة خلط الأعلاف", category: "machine", acquiredDate: "2022-01-10", cost: 420_000, usefulLifeYears: 12, salvageValue: 40_000, status: "active" },
    { id: "asset_tractor", farmId: FARM_ID, name: "Tractor", nameAr: "جرار", category: "vehicle", acquiredDate: "2020-11-05", cost: 550_000, usefulLifeYears: 15, salvageValue: 70_000, status: "active" },
    { id: "asset_generator", farmId: FARM_ID, name: "Diesel generator", nameAr: "مولّد ديزل", category: "equipment", acquiredDate: "2021-07-18", cost: 180_000, usefulLifeYears: 8, salvageValue: 15_000, status: "active" },
  ];

  // The books, derived from the money already generated above so the demo
  // ledger always agrees with the finance page.
  const accounts = defaultChartOfAccounts(FARM_ID);
  const journalEntries = journalFromTransactions(transactions, accounts);
  const fiscalYears: FiscalYear[] = [
    {
      id: "fy_current",
      farmId: FARM_ID,
      name: String(new Date(TODAY).getFullYear()),
      startDate: `${new Date(TODAY).getFullYear()}-01-01`,
      endDate: `${new Date(TODAY).getFullYear()}-12-31`,
      status: "open",
    },
  ];

  return {
    farm,
    zones,
    animals,
    employees,
    attendance,
    breeding,
    semen,
    health,
    feedItems,
    rations,
    feedConsumption,
    inventory,
    movements,
    tasks,
    transactions,
    invoices,
    partners,
    assets,
    accounts,
    journalEntries,
    fiscalYears,
    alerts,
    weather,
    utilities,
    milkDaily,
  };
}
