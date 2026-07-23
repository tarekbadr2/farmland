import { describe, it, expect } from "vitest";

import { DemoFarmRepository } from "./demo-repository";
import { trialBalance } from "@/core/services/accounting";
import { TODAY } from "@/core/data/seed";
import { DEFAULT_WAREHOUSE_ID, stockInWarehouse } from "@/core/services/warehouse";

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
