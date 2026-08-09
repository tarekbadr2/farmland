import { describe, it, expect } from "vitest";

import { DemoFarmRepository } from "./demo-repository";
import { trialBalance } from "@/core/services/accounting";
import { resolveFeeding } from "@/core/services/rations";
import { TODAY } from "@/core/data/seed";
import { DEFAULT_WAREHOUSE_ID, stockInWarehouse } from "@/core/services/warehouse";
import type { Animal, AnimalDisposal } from "@/core/domain/types";

/**
 * Integration cover for the document → ledger wiring.
 *
 * The pure posting functions are tested in accounting.test.ts; what these
 * exercise is that the repository actually calls them, writes the entry, and
 * leaves the books balanced. That's the seam where a purchase bill could
 * silently fail to reach the ledger.
 *
 * getDataset() is a module-level singleton, so every repository instance shares
 * one dataset — each test therefore reads balances as deltas rather than
 * assuming it starts from zero.
 */
const repo = new DemoFarmRepository();

async function balanceOf(systemKey: string): Promise<number> {
  const accounts = await repo.getAccounts();
  const entries = await repo.getJournalEntries();
  const account = accounts.find((a) => a.systemKey === systemKey)!;
  const { rows } = trialBalance(accounts, entries, { includeZero: true });
  const row = rows.find((r) => r.account.id === account.id);
  return row ? row.debit - row.credit : 0;
}

async function booksBalance(): Promise<boolean> {
  const [accounts, entries] = await Promise.all([repo.getAccounts(), repo.getJournalEntries()]);
  return trialBalance(accounts, entries).balanced;
}

describe("demo repository — documents reach the ledger", () => {
  it("starts from balanced books", async () => {
    expect(await booksBalance()).toBe(true);
  });

  it("a purchase bill debits the cost and credits the supplier", async () => {
    const beforeExpense = await balanceOf("expense_other");
    const beforePayable = await balanceOf("payable");

    await repo.saveInvoice({
      kind: "purchase",
      number: "TEST-BILL-1",
      customerId: "partner_x",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: [{ description: "Bran", qty: 10, unitPrice: 500 }],
      paidAmount: 0,
      status: "sent",
    });

    // 10 × 500 = 5,000 of cost, owed to the supplier.
    expect((await balanceOf("expense_other")) - beforeExpense).toBe(5_000);
    expect((await balanceOf("payable")) - beforePayable).toBe(-5_000); // credit side
    expect(await booksBalance()).toBe(true);
  });

  it("a draft stays out of the books until it's issued", async () => {
    const before = await balanceOf("expense_other");
    await repo.saveInvoice({
      kind: "purchase",
      number: "TEST-DRAFT-1",
      customerId: "partner_x",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: [{ description: "Ghost", qty: 1, unitPrice: 9_999 }],
      paidAmount: 0,
      status: "draft",
    });
    expect(await balanceOf("expense_other")).toBe(before);
  });

  it("paying a bill clears the payable and takes money out — cost unchanged", async () => {
    const bill = await repo.saveInvoice({
      kind: "purchase",
      number: "TEST-BILL-2",
      customerId: "partner_x",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: [{ description: "Maize", qty: 1, unitPrice: 3_000 }],
      paidAmount: 0,
      status: "sent",
    });

    const expenseAfterBill = await balanceOf("expense_other");
    const payableAfterBill = await balanceOf("payable");
    const cashAfterBill = await balanceOf("cash");

    await repo.recordInvoicePayment({
      invoiceId: bill.id,
      amount: 3_000,
      date: TODAY,
      paymentMethod: "cash",
    });

    // The debt goes down, cash goes out, and the cost is NOT counted twice.
    expect((await balanceOf("payable")) - payableAfterBill).toBe(3_000);
    expect((await balanceOf("cash")) - cashAfterBill).toBe(-3_000);
    expect(await balanceOf("expense_other")).toBe(expenseAfterBill);
    expect(await booksBalance()).toBe(true);
  });

  it("a purchase return backs the bill out again", async () => {
    const beforeExpense = await balanceOf("expense_other");
    const beforePayable = await balanceOf("payable");

    const line = [{ description: "Spoiled bran", qty: 4, unitPrice: 500 }];
    await repo.saveInvoice({
      kind: "purchase",
      number: "TEST-BILL-3",
      customerId: "partner_x",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: line,
      paidAmount: 0,
      status: "sent",
    });
    await repo.saveInvoice({
      kind: "purchase_return",
      number: "TEST-PRET-1",
      customerId: "partner_x",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: line,
      paidAmount: 0,
      status: "sent",
    });

    expect(await balanceOf("expense_other")).toBe(beforeExpense);
    expect(await balanceOf("payable")).toBe(beforePayable);
    expect(await booksBalance()).toBe(true);
  });

  it("a recorded cost lands in the ledger and keeps it balanced", async () => {
    const before = await balanceOf("expense_maintenance");
    await repo.recordCost({
      category: "maintenance",
      amount: 1_200,
      date: TODAY,
      description: "Tractor service",
      paymentMethod: "cash",
    });
    expect((await balanceOf("expense_maintenance")) - before).toBe(1_200);
    expect(await booksBalance()).toBe(true);
  });

  it("a cheque moves the debt into notes and keeps the books balanced", async () => {
    const beforeNotes = await balanceOf("notes_receivable");
    const cheque = await repo.saveCheque({
      kind: "receivable",
      chequeNumber: "TEST-9001",
      amount: 7_500,
      issuedDate: TODAY,
      dueDate: TODAY,
      partnerId: "partner_x",
      status: "held",
    });
    expect((await balanceOf("notes_receivable")) - beforeNotes).toBe(7_500);
    expect(await booksBalance()).toBe(true);

    // Collecting turns the note into cash.
    const cashBefore = await balanceOf("cash");
    const accounts = await repo.getAccounts();
    const cashAccount = accounts.find((a) => a.systemKey === "cash")!;
    await repo.setChequeStatus(cheque.id, "collected", { treasuryAccountId: cashAccount.id });

    expect((await balanceOf("cash")) - cashBefore).toBe(7_500);
    expect(await balanceOf("notes_receivable")).toBe(beforeNotes);
    expect(await booksBalance()).toBe(true);
  });
});

describe("demo repository — stores, transfers and stocktake", () => {
  it("a transfer moves stock between stores without changing the farm total", async () => {
    const items = await repo.getInventory();
    const item = items[0];
    const totalBefore = item.stock;

    const before = await repo.getStockMovements();
    const fromHeld = stockInWarehouse(item, DEFAULT_WAREHOUSE_ID, before);
    const qty = Math.min(5, fromHeld);

    await repo.transferStock({
      itemId: item.id,
      fromWarehouseId: DEFAULT_WAREHOUSE_ID,
      toWarehouseId: "wh_feed",
      quantity: qty,
      date: TODAY,
    });

    const after = await repo.getStockMovements();
    const refreshed = (await repo.getInventory()).find((i) => i.id === item.id)!;

    // The farm still owns the same amount — it just sits elsewhere.
    expect(refreshed.stock).toBe(totalBefore);
    expect(stockInWarehouse(refreshed, DEFAULT_WAREHOUSE_ID, after)).toBe(fromHeld - qty);
    expect(stockInWarehouse(refreshed, "wh_feed", after)).toBe(qty);
  });

  it("writes the transfer as a linked out/in pair", async () => {
    const item = (await repo.getInventory())[1];
    const [out, into] = await repo.transferStock({
      itemId: item.id,
      fromWarehouseId: DEFAULT_WAREHOUSE_ID,
      toWarehouseId: "wh_vet",
      quantity: 1,
      date: TODAY,
    });
    expect(out.kind).toBe("out");
    expect(into.kind).toBe("in");
    expect(out.transferId).toBe(into.transferId);
  });

  it("refuses to move more than the source store holds", async () => {
    const item = (await repo.getInventory())[0];
    await expect(
      repo.transferStock({
        itemId: item.id,
        fromWarehouseId: "wh_vet", // holds ~nothing of this item
        toWarehouseId: DEFAULT_WAREHOUSE_ID,
        quantity: 100_000,
        date: TODAY,
      }),
    ).rejects.toThrow("insufficient-in-store");
  });

  it("refuses a transfer to the same store", async () => {
    const item = (await repo.getInventory())[0];
    await expect(
      repo.transferStock({
        itemId: item.id,
        fromWarehouseId: DEFAULT_WAREHOUSE_ID,
        toWarehouseId: DEFAULT_WAREHOUSE_ID,
        quantity: 1,
        date: TODAY,
      }),
    ).rejects.toThrow("same-store");
  });

  it("a stocktake writes an adjustment only where the count differs", async () => {
    const items = await repo.getInventory();
    const [a, b] = items;
    const movements = await repo.getStockMovements();
    const expectedA = stockInWarehouse(a, DEFAULT_WAREHOUSE_ID, movements);
    const expectedB = stockInWarehouse(b, DEFAULT_WAREHOUSE_ID, movements);

    const written = await repo.recordStocktake({
      warehouseId: DEFAULT_WAREHOUSE_ID,
      date: TODAY,
      lines: [
        { itemId: a.id, counted: expectedA - 3 }, // short by 3
        { itemId: b.id, counted: expectedB }, // matches — no movement
      ],
    });

    expect(written).toHaveLength(1);
    expect(written[0].itemId).toBe(a.id);
    expect(written[0].quantity).toBe(-3);
    expect(written[0].countedQty).toBe(expectedA - 3);
  });

  it("after a stocktake the store holds exactly what was counted", async () => {
    const item = (await repo.getInventory())[2];
    const movements = await repo.getStockMovements();
    const expected = stockInWarehouse(item, DEFAULT_WAREHOUSE_ID, movements);
    const counted = expected + 7; // found more than the system thought

    await repo.recordStocktake({
      warehouseId: DEFAULT_WAREHOUSE_ID,
      date: TODAY,
      lines: [{ itemId: item.id, counted }],
    });

    const after = await repo.getStockMovements();
    const refreshed = (await repo.getInventory()).find((i) => i.id === item.id)!;
    expect(stockInWarehouse(refreshed, DEFAULT_WAREHOUSE_ID, after)).toBe(counted);
  });
});

describe("demo repository — livestock transfers", () => {
  it("moves every selected animal and records the document", async () => {
    const zones = await repo.getZones();
    const pens = zones.filter((z) => z.kind === "pen");
    const target = pens[1];

    const page = await repo.listAnimals({ pageSize: 100_000 });
    const movers = page.items
      .filter((a) => a.penId !== target.id && (a.status === "active" || a.status === "quarantine"))
      .slice(0, 3);

    const transfer = await repo.recordLivestockTransfer({
      toZoneId: target.id,
      animalIds: movers.map((a) => a.id),
      date: TODAY,
      reason: "regrouping",
    });

    expect(transfer.number).toMatch(/^LT-\d{4}-\d{4}$/);
    expect(transfer.animalIds).toHaveLength(3);

    // The herd moved with the paperwork.
    const after = await repo.listAnimals({ pageSize: 100_000 });
    for (const m of movers) {
      expect(after.items.find((a) => a.id === m.id)!.penId).toBe(target.id);
    }
    expect((await repo.getLivestockTransfers())[0].id).toBe(transfer.id);
  });

  it("records a shared origin, and leaves it blank for a mixed group", async () => {
    const zones = await repo.getZones();
    const pens = zones.filter((z) => z.kind === "pen");
    const page = await repo.listAnimals({ pageSize: 100_000 });

    const fromOnePen = page.items.filter((a) => a.penId === pens[0].id && a.status === "active").slice(0, 2);
    if (fromOnePen.length === 2) {
      const t = await repo.recordLivestockTransfer({
        toZoneId: pens[2].id,
        animalIds: fromOnePen.map((a) => a.id),
        date: TODAY,
      });
      expect(t.fromZoneId).toBe(pens[0].id);
    }
  });

  it("refuses a move into a store and a move of an animal that has left", async () => {
    const zones = await repo.getZones();
    const store = zones.find((z) => z.kind === "feed_store")!;
    const page = await repo.listAnimals({ pageSize: 100_000 });
    const someone = page.items.find((a) => a.status === "active")!;

    await expect(
      repo.recordLivestockTransfer({ toZoneId: store.id, animalIds: [someone.id], date: TODAY }),
    ).rejects.toThrow("zone-not-for-animals");

    const gone = page.items.find((a) => a.status === "sold" || a.status === "dead");
    if (gone) {
      const pen = zones.find((z) => z.kind === "pen")!;
      await expect(
        repo.recordLivestockTransfer({ toZoneId: pen.id, animalIds: [gone.id], date: TODAY }),
      ).rejects.toThrow("animal-not-movable");
    }
  });

  it("refuses a move where the animals are already in that pen", async () => {
    const page = await repo.listAnimals({ pageSize: 100_000 });
    const someone = page.items.find((a) => a.status === "active")!;
    await expect(
      repo.recordLivestockTransfer({
        toZoneId: someone.penId,
        animalIds: [someone.id],
        date: TODAY,
      }),
    ).rejects.toThrow("already-in-zone");
  });
});

describe("demo repository — production work orders", () => {
  it("rolls material and overhead cost into the product's unit cost", async () => {
    const feed = await repo.getFeedItems();
    // Pick inputs that actually have stock, and consume a safe slice of it —
    // the seed doesn't promise any particular quantity.
    const stocked = feed.filter((f) => f.stock > 20);
    const [bran, maize] = stocked;
    const target = feed.find((f) => f.id !== bran.id && f.id !== maize.id)!;

    // The demo adapter hands back live item objects, so "before" values must be
    // copied out as primitives — holding the object would silently track the
    // mutation and make the assertions compare a value against itself.
    const branStockBefore = bran.stock;
    const maizeStockBefore = maize.stock;
    const qtyBran = Math.floor(branStockBefore / 10);
    const qtyMaize = Math.floor(maizeStockBefore / 10);
    const produced = qtyBran + qtyMaize;

    const branCost = bran.costPerUnit;
    const maizeCost = maize.costPerUnit;
    const targetBefore = { stock: target.stock, cost: target.costPerUnit };

    const order = await repo.saveWorkOrder({
      date: TODAY,
      name: "Mix ration",
      status: "planned",
      inputs: [
        { source: "feed", itemId: bran.id, quantity: qtyBran },
        { source: "feed", itemId: maize.id, quantity: qtyMaize },
      ],
      outputs: [{ source: "feed", itemId: target.id, quantity: produced }],
      overheadCost: 300,
    });
    expect(order.number).toMatch(/^WO-\d{4}-\d{4}$/);

    const done = await repo.completeWorkOrder(order.id);

    const expectedMaterial = qtyBran * branCost + qtyMaize * maizeCost;
    expect(done.materialCost).toBeCloseTo(expectedMaterial, 2);
    expect(done.totalCost).toBeCloseTo(expectedMaterial + 300, 2);
    expect(done.status).toBe("done");

    // Inputs drawn, output added.
    const after = await repo.getFeedItems();
    expect(after.find((f) => f.id === bran.id)!.stock).toBeCloseTo(branStockBefore - qtyBran, 2);
    expect(after.find((f) => f.id === maize.id)!.stock).toBeCloseTo(maizeStockBefore - qtyMaize, 2);
    const producedItem = after.find((f) => f.id === target.id)!;
    expect(producedItem.stock).toBeCloseTo(targetBefore.stock + produced, 2);

    // The product's cost moved toward what the run actually cost per unit.
    const runUnitCost = (expectedMaterial + 300) / produced;
    const blended =
      (targetBefore.stock * targetBefore.cost +
        produced * (Math.round(runUnitCost * 100) / 100)) /
      (targetBefore.stock + produced);
    expect(producedItem.costPerUnit).toBeCloseTo(blended, 1);
  });

  it("writes an out movement per input and an in movement per output", async () => {
    const feed = await repo.getFeedItems();
    const source = feed.find((f) => f.stock > 20)!;
    const sink = feed.find((f) => f.id !== source.id)!;
    const order = await repo.saveWorkOrder({
      date: TODAY,
      name: "Second mix",
      status: "planned",
      inputs: [{ source: "feed", itemId: source.id, quantity: 10 }],
      outputs: [{ source: "feed", itemId: sink.id, quantity: 10 }],
    });
    await repo.completeWorkOrder(order.id);

    const movements = await repo.getStockMovements();
    const mine = movements.filter((m) => m.reference?.includes(order.number));
    expect(mine.filter((m) => m.kind === "out")).toHaveLength(1);
    expect(mine.filter((m) => m.kind === "in")).toHaveLength(1);
  });

  it("refuses to run twice, and refuses one it can't source", async () => {
    const feed = await repo.getFeedItems();
    const source = feed.find((f) => f.stock > 20)!;
    const sink = feed.find((f) => f.id !== source.id)!;
    const order = await repo.saveWorkOrder({
      date: TODAY,
      name: "Once only",
      status: "planned",
      inputs: [{ source: "feed", itemId: source.id, quantity: 5 }],
      outputs: [{ source: "feed", itemId: sink.id, quantity: 5 }],
    });
    await repo.completeWorkOrder(order.id);
    await expect(repo.completeWorkOrder(order.id)).rejects.toThrow("already-completed");

    const greedy = await repo.saveWorkOrder({
      date: TODAY,
      name: "Too much",
      status: "planned",
      inputs: [{ source: "feed", itemId: source.id, quantity: 9_999_999 }],
      outputs: [{ source: "feed", itemId: sink.id, quantity: 1 }],
    });
    await expect(repo.completeWorkOrder(greedy.id)).rejects.toThrow("insufficient-stock");
  });
});

describe("demo repository — feeding draws stock and formulas are editable", () => {
  it("logging a feeding records consumption and draws each component from stock", async () => {
    const rations = await repo.getRations();
    const r = rations[0];
    const feedsBefore = await repo.getFeedItems();
    const stockBefore = new Map(feedsBefore.map((f) => [f.id, f.stock]));
    const pen = (await repo.getZones()).find((z) => z.kind === "pen")!;

    const expected = resolveFeeding(r, 10, feedsBefore);
    const rec = await repo.logFeedConsumption({
      date: TODAY,
      zoneId: pen.id,
      rationId: r.id,
      heads: 10,
    });

    // The write agrees with the shared math, and it's readable back.
    expect(rec.kg).toBe(expected.totalKg);
    expect(rec.cost).toBe(expected.totalCost);
    expect(rec.kg).toBeGreaterThan(0);
    expect((await repo.getFeedConsumption()).find((c) => c.id === rec.id)).toBeTruthy();

    // Every ingredient with a share was actually drawn down.
    const feedsAfter = await repo.getFeedItems();
    for (const c of r.components) {
      if (c.percent <= 0) continue;
      const after = feedsAfter.find((f) => f.id === c.feedItemId)!.stock;
      expect(after).toBeLessThan(stockBefore.get(c.feedItemId)!);
    }
  });

  it("a per-feeding kg/head override scales the draw", async () => {
    const r = (await repo.getRations())[0];
    const pen = (await repo.getZones()).find((z) => z.kind === "pen")!;
    const feeds = await repo.getFeedItems();

    const base = resolveFeeding(r, 5, feeds);
    const rec = await repo.logFeedConsumption({
      date: TODAY,
      zoneId: pen.id,
      rationId: r.id,
      heads: 5,
      kgPerHead: r.kgPerHead * 2,
    });
    // Doubling the per-head amount roughly doubles the kilograms drawn.
    expect(Math.abs(rec.kg - base.totalKg * 2)).toBeLessThan(1);
  });

  it("creating a formula normalizes it, derives cost/head, and deleting removes it", async () => {
    const [a, b] = await repo.getFeedItems();
    const saved = await repo.saveRation({
      name: "Test blend",
      nameAr: "خلطة اختبار",
      targetGroup: "lactating",
      kgPerHead: 20,
      components: [
        { feedItemId: a.id, percent: 60 },
        { feedItemId: b.id, percent: 40 },
      ],
    });

    expect(saved.id).toBeTruthy();
    expect(saved.kgPerHead).toBe(20);
    expect(saved.costPerHead).toBeGreaterThan(0);
    expect((await repo.getRations()).find((r) => r.id === saved.id)).toBeTruthy();

    await repo.deleteRation(saved.id);
    expect((await repo.getRations()).find((r) => r.id === saved.id)).toBeUndefined();
  });
});

describe("demo repository — invoice payment direction", () => {
  it("paying a purchase bill books an EXPENSE, not phantom income", async () => {
    const bill = await repo.saveInvoice({
      kind: "purchase",
      number: "TEST-DIR-BILL",
      customerId: "partner_x",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: [{ description: "Vet supplies", qty: 1, unitPrice: 4_000 }],
      paidAmount: 0,
      status: "sent",
    });

    const txnsBefore = (await repo.getTransactions()).length;
    await repo.recordInvoicePayment({
      invoiceId: bill.id,
      amount: 4_000,
      date: TODAY,
      paymentMethod: "cash",
    });

    const txns = await repo.getTransactions();
    const payment = txns.find((t) => t.invoiceId === bill.id);
    expect(txns.length).toBe(txnsBefore + 1);
    expect(payment?.kind).toBe("expense"); // the bug booked "income"
  });

  it("paying a sale still books income", async () => {
    const sale = await repo.saveInvoice({
      kind: "sale",
      number: "TEST-DIR-SALE",
      customerId: "partner_y",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: [{ description: "Milk", qty: 1, unitPrice: 2_000 }],
      paidAmount: 0,
      status: "sent",
    });
    await repo.recordInvoicePayment({
      invoiceId: sale.id,
      amount: 2_000,
      date: TODAY,
      paymentMethod: "cash",
    });
    const payment = (await repo.getTransactions()).find((t) => t.invoiceId === sale.id);
    expect(payment?.kind).toBe("income");
  });
});

describe("demo repository — overpayment can't drive receivables negative", () => {
  it("caps the applied amount and the ledger credit to what's outstanding", async () => {
    const sale = await repo.saveInvoice({
      kind: "sale",
      number: "TEST-OVERPAY",
      customerId: "partner_x",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: [{ description: "Milk", qty: 1, unitPrice: 1_000 }],
      paidAmount: 0,
      status: "sent",
    });

    await repo.recordInvoicePayment({ invoiceId: sale.id, amount: 900, date: TODAY, paymentMethod: "cash" });
    // Overpay: 500 against only 100 outstanding.
    await repo.recordInvoicePayment({ invoiceId: sale.id, amount: 500, date: TODAY, paymentMethod: "cash" });

    const inv = (await repo.getInvoices()).find((i) => i.id === sale.id)!;
    expect(inv.status).toBe("paid");
    expect(inv.paidAmount).toBe(1_000); // never exceeds the total

    // The two payment transactions for this invoice sum to the total, not 1,400.
    const paid = (await repo.getTransactions())
      .filter((t) => t.invoiceId === sale.id)
      .reduce((s, t) => s + t.amount, 0);
    expect(paid).toBe(1_000);
  });
});

describe("demo repository — animal tag uniqueness", () => {
  const base = {
    name: "Dup test",
    sex: "female" as const,
    breed: "murrah" as const,
    dateOfBirth: "2022-01-01",
    milkStatus: "lactating" as const,
    reproStatus: "open" as const,
    weightKg: 400,
    penId: "pen_a1",
  };

  it("rejects a duplicate tag on create (case-insensitive) but allows editing the same animal", async () => {
    const a = await repo.saveAnimal({ tag: "UNIQ-1", ...base } as Partial<Animal>);

    // A second create with the same tag (any case) is refused.
    await expect(repo.saveAnimal({ tag: "UNIQ-1", ...base } as Partial<Animal>)).rejects.toThrow(
      /duplicate-tag/,
    );
    await expect(repo.saveAnimal({ tag: "uniq-1", ...base } as Partial<Animal>)).rejects.toThrow(
      /duplicate-tag/,
    );

    // Editing the SAME animal (same id) keeping its tag must NOT be a false positive.
    await expect(
      repo.saveAnimal({ id: a.id, tag: "UNIQ-1", name: "Renamed" } as Partial<Animal>),
    ).resolves.toBeTruthy();
  });
});

describe("demo repository — animal disposal side effects", () => {
  it("posts sale income to the ledger, ends lactation, and can't be re-disposed", async () => {
    const a = await repo.saveAnimal({
      tag: "SELL-1",
      name: "Sale test",
      sex: "female",
      breed: "murrah",
      dateOfBirth: "2022-01-01",
      milkStatus: "lactating",
      reproStatus: "open",
      weightKg: 500,
      penId: "pen_a1",
    } as Partial<Animal>);
    expect(a.milkStatus).toBe("lactating");

    const jeBefore = (await repo.getJournalEntries()).length;
    const disposal: AnimalDisposal = { type: "sold", date: TODAY, proceeds: 40_000 };
    await repo.disposeAnimal(a.id, disposal);

    // (C2) leaving the herd ends lactation + pregnancy → can't be milked
    const sold = await repo.getAnimal(a.id);
    expect(sold?.status).toBe("sold");
    expect(sold?.milkStatus).toBe("not_applicable");
    expect(sold?.reproStatus).toBe("not_applicable");

    // (C1) the sale reached the general ledger, and the books still balance
    const jeAfter = await repo.getJournalEntries();
    expect(jeAfter.length).toBeGreaterThan(jeBefore);
    expect(await booksBalance()).toBe(true);

    // (H6) idempotent: a second disposal is refused, so income isn't double-posted
    const salesFor = async () =>
      (await repo.getTransactions()).filter(
        (t) => t.animalId === a.id && t.category === "animal_sales",
      ).length;
    expect(await salesFor()).toBe(1);
    await expect(repo.disposeAnimal(a.id, disposal)).rejects.toThrow(/already-disposed/);
    expect(await salesFor()).toBe(1);
  });
});

describe("demo repository — duplicate same-day payments", () => {
  it("two equal payments on one day both reach the ledger (no id collision)", async () => {
    const sale = await repo.saveInvoice({
      kind: "sale",
      number: "TEST-DUP-PAY",
      customerId: "partner_z",
      issuedAt: TODAY,
      dueAt: TODAY,
      lines: [{ description: "Milk", qty: 1, unitPrice: 2_000 }],
      paidAmount: 0,
      status: "sent",
    });

    const before = (await repo.getJournalEntries()).filter((e) =>
      e.id.startsWith(`jv_pay_`),
    ).length;

    // Same amount, same day — the old composite id would have collided.
    await repo.recordInvoicePayment({ invoiceId: sale.id, amount: 1_000, date: TODAY, paymentMethod: "cash" });
    await repo.recordInvoicePayment({ invoiceId: sale.id, amount: 1_000, date: TODAY, paymentMethod: "cash" });

    const settlements = (await repo.getJournalEntries()).filter((e) => e.id.startsWith("jv_pay_"));
    expect(settlements.length).toBe(before + 2); // two distinct settlement entries
    const updated = (await repo.getInvoices()).find((i) => i.id === sale.id)!;
    expect(updated.status).toBe("paid"); // 1000 + 1000 = 2000
  });
});

describe("demo repository — audit-fix regressions", () => {
  it("rejects a non-finite transaction amount before it can poison the ledger", async () => {
    await expect(
      repo.saveTransaction({
        date: TODAY,
        kind: "expense",
        category: "other_expense",
        amount: Number.NaN,
        description: "NaN guard",
        paymentMethod: "cash",
      }),
    ).rejects.toThrow();
    expect(await booksBalance()).toBe(true); // nothing written → still balanced
  });

  it("marks a purchased animal's mirrored asset disposed when it's sold", async () => {
    const saved = await repo.saveAnimal({
      tag: "DISP-REG",
      name: "Disposable",
      sex: "female",
      breed: "buffalo",
      dateOfBirth: TODAY,
      acquiredAt: TODAY,
      acquisitionCost: 5000,
      weightKg: 400,
    } as unknown as Partial<Animal> & { id?: string });

    const assetId = `asset_animal_${saved.id}`;
    const before = (await repo.getAssets()).find((a) => a.id === assetId);
    expect(before?.status).toBe("active"); // purchase mirrored into the asset register

    await repo.disposeAnimal(saved.id, {
      type: "sold",
      date: TODAY,
      proceeds: 6000,
    } as AnimalDisposal);

    const after = (await repo.getAssets()).find((a) => a.id === assetId);
    expect(after?.status).toBe("disposed"); // no longer double-counted as an active asset
  });

  it("lets a corrected (lower) milking head count take effect", async () => {
    const date = "2027-03-01"; // clean date, clear of the seeded range
    const entries = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ animalId: `mc${i}`, volumeL: 10 }));

    await repo.recordMilkSession({ date, session: "morning", entries: entries(100), fatPct: 4, proteinPct: 3 });
    let day = (await repo.getMilkDaily()).find((d) => d.date === date)!;
    expect(day.milkingCows).toBe(100);

    // Re-record the same session with fewer head — must correct DOWN, not stay
    // pinned at 100 (the Math.max bug).
    await repo.recordMilkSession({ date, session: "morning", entries: entries(80), fatPct: 4, proteinPct: 3 });
    day = (await repo.getMilkDaily()).find((d) => d.date === date)!;
    expect(day.milkingCows).toBe(80);
  });
});
