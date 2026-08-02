"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRepository, type AnimalQuery } from "@/core/repositories";
import type {
  Account,
  Cheque,
  Warehouse,
  ChequeStatus,
  FarmTask,
  FeedRation,
  FiscalYear,
  ID,
  Branch,
  Currency,
  JournalEntry,
  WorkOrder,
} from "@/core/domain/types";
import type { CostInput, PurchaseInput } from "@/core/services/automation";
import type {
  LivestockTransferInput,
  StockTransferInput,
  StocktakeInput,
} from "@/core/repositories/farm-repository";

const repo = getRepository();

/** Query keys live in one place so invalidation never guesses. */
export const qk = {
  farm: ["farm"] as const,
  zones: ["zones"] as const,
  animals: (q: AnimalQuery) => ["animals", q] as const,
  animal: (id: ID) => ["animal", id] as const,
  timeline: (id: ID) => ["timeline", id] as const,
  animalMilk: (id: ID) => ["animal-milk", id] as const,
  animalWeight: (id: ID) => ["animal-weight", id] as const,
  milkDaily: ["milk-daily"] as const,
  breeding: ["breeding"] as const,
  semen: ["semen"] as const,
  health: ["health"] as const,
  feedItems: ["feed-items"] as const,
  rations: ["rations"] as const,
  feedConsumption: ["feed-consumption"] as const,
  inventory: ["inventory"] as const,
  movements: ["movements"] as const,
  employees: ["employees"] as const,
  attendance: ["attendance"] as const,
  tasks: ["tasks"] as const,
  transactions: ["transactions"] as const,
  invoices: ["invoices"] as const,
  partners: ["partners"] as const,
  assets: ["assets"] as const,
  warehouses: ["warehouses"] as const,
  livestockTransfers: ["livestock-transfers"] as const,
  workOrders: ["work-orders"] as const,
  branches: ["branches"] as const,
  currencies: ["currencies"] as const,
  cheques: ["cheques"] as const,
  accounts: ["accounts"] as const,
  journal: ["journal"] as const,
  fiscalYears: ["fiscal-years"] as const,
  alerts: ["alerts"] as const,
  weather: ["weather"] as const,
  utilities: ["utilities"] as const,
  members: ["members"] as const,
  pendingInvites: ["pending-invites"] as const,
  activity: ["activity"] as const,
  transferRequests: ["transfer-requests"] as const,
  purchases: ["purchases"] as const,
};

export const useFarm = () => useQuery({ queryKey: qk.farm, queryFn: () => repo.getFarm() });
export const useZones = () => useQuery({ queryKey: qk.zones, queryFn: () => repo.getZones() });

export const useMembers = () =>
  useQuery({ queryKey: qk.members, queryFn: () => repo.getMembers() });
export const usePendingInvites = () =>
  useQuery({ queryKey: qk.pendingInvites, queryFn: () => repo.getPendingInvites() });

export const useAnimals = (query: AnimalQuery = {}) =>
  useQuery({ queryKey: qk.animals(query), queryFn: () => repo.listAnimals(query) });

export const useAnimal = (id: ID) =>
  useQuery({ queryKey: qk.animal(id), queryFn: () => repo.getAnimal(id), enabled: !!id });

export const useAnimalTimeline = (id: ID) =>
  useQuery({ queryKey: qk.timeline(id), queryFn: () => repo.getAnimalTimeline(id), enabled: !!id });

export const useAnimalMilk = (id: ID) =>
  useQuery({ queryKey: qk.animalMilk(id), queryFn: () => repo.getAnimalMilkHistory(id), enabled: !!id });

export const useAnimalWeight = (id: ID) =>
  useQuery({ queryKey: qk.animalWeight(id), queryFn: () => repo.getAnimalWeightHistory(id), enabled: !!id });

export const useMilkDaily = () =>
  useQuery({ queryKey: qk.milkDaily, queryFn: () => repo.getMilkDaily() });

export const useBreeding = () =>
  useQuery({ queryKey: qk.breeding, queryFn: () => repo.getBreedingEvents() });

export const useSemen = () => useQuery({ queryKey: qk.semen, queryFn: () => repo.getSemenInventory() });
export const useHealth = () => useQuery({ queryKey: qk.health, queryFn: () => repo.getHealthEvents() });
export const useFeedItems = () => useQuery({ queryKey: qk.feedItems, queryFn: () => repo.getFeedItems() });
export const useRations = () => useQuery({ queryKey: qk.rations, queryFn: () => repo.getRations() });

export function useSaveRation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ration: Omit<FeedRation, "id" | "farmId" | "costPerHead"> & { id?: ID }) =>
      repo.saveRation(ration),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.rations }),
  });
}

export function useDeleteRation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: ID) => repo.deleteRation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.rations }),
  });
}

export const useFeedConsumption = () =>
  useQuery({ queryKey: qk.feedConsumption, queryFn: () => repo.getFeedConsumption() });
export const useInventory = () => useQuery({ queryKey: qk.inventory, queryFn: () => repo.getInventory() });
export const useMovements = () => useQuery({ queryKey: qk.movements, queryFn: () => repo.getStockMovements() });
export const useEmployees = () => useQuery({ queryKey: qk.employees, queryFn: () => repo.getEmployees() });
export const useAttendance = () => useQuery({ queryKey: qk.attendance, queryFn: () => repo.getAttendance() });
export const useTasks = () => useQuery({ queryKey: qk.tasks, queryFn: () => repo.getTasks() });
export const useTransactions = () =>
  useQuery({ queryKey: qk.transactions, queryFn: () => repo.getTransactions() });
export const useInvoices = () => useQuery({ queryKey: qk.invoices, queryFn: () => repo.getInvoices() });
export const usePartners = () => useQuery({ queryKey: qk.partners, queryFn: () => repo.getPartners() });
export const useAssets = () => useQuery({ queryKey: qk.assets, queryFn: () => repo.getAssets() });
export const useAlerts = () => useQuery({ queryKey: qk.alerts, queryFn: () => repo.getAlerts() });
export const useActivity = (max = 200) =>
  useQuery({ queryKey: [...qk.activity, max], queryFn: () => repo.listActivity(max) });
export const useTransferRequests = () =>
  useQuery({ queryKey: qk.transferRequests, queryFn: () => repo.getTransferRequests() });
export const usePurchases = () =>
  useQuery({ queryKey: qk.purchases, queryFn: () => repo.getPurchases() });
export const useWeather = () => useQuery({ queryKey: qk.weather, queryFn: () => repo.getWeather() });
export const useUtilities = () => useQuery({ queryKey: qk.utilities, queryFn: () => repo.getUtilities() });

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: ID; patch: Partial<FarmTask> }) => repo.updateTask(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks }),
  });
}

export function useMarkAlertRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: ID) => repo.markAlertRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.alerts }),
  });
}

/* ------------------------------- Accounting -------------------------------- */

export const useAccounts = () =>
  useQuery({ queryKey: qk.accounts, queryFn: () => repo.getAccounts() });

export const useJournalEntries = () =>
  useQuery({ queryKey: qk.journal, queryFn: () => repo.getJournalEntries() });

export const useFiscalYears = () =>
  useQuery({ queryKey: qk.fiscalYears, queryFn: () => repo.getFiscalYears() });

export function useSaveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (account: Omit<Account, "id" | "farmId"> & { id?: ID }) =>
      repo.saveAccount(account),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.accounts }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: ID) => repo.deleteAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.accounts }),
  });
}

export function useSaveJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      entry: Omit<JournalEntry, "id" | "farmId" | "number"> & { id?: ID; number?: string },
    ) => repo.saveJournalEntry(entry),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.journal }),
  });
}

export function useSetJournalStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: ID; status: JournalEntry["status"] }) =>
      repo.setJournalStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.journal }),
  });
}

export function useCloseFiscalYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: ID) => repo.closeFiscalYear(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.fiscalYears }),
  });
}

export function useSaveFiscalYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year: Omit<FiscalYear, "id" | "farmId"> & { id?: ID }) =>
      repo.saveFiscalYear(year),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.fiscalYears }),
  });
}

/* ------------------------------- Automation -------------------------------- */

/** Buy stock: raises the item, books the expense, posts to the ledger. */
export function useRecordPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PurchaseInput) => repo.recordPurchase(input),
    onSuccess: () => {
      // Touches stock, movements, expenses and the books at once.
      qc.invalidateQueries({ queryKey: qk.feedItems });
      qc.invalidateQueries({ queryKey: qk.inventory });
      qc.invalidateQueries({ queryKey: qk.movements });
      qc.invalidateQueries({ queryKey: qk.transactions });
      qc.invalidateQueries({ queryKey: qk.journal });
    },
  });
}

/** Book a non-stock cost (maintenance, transport, wages). */
export function useRecordCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CostInput) => repo.recordCost(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.transactions });
      qc.invalidateQueries({ queryKey: qk.journal });
    },
  });
}

/* --------------------------------- Cheques --------------------------------- */

export const useCheques = () =>
  useQuery({ queryKey: qk.cheques, queryFn: () => repo.getCheques() });

export function useSaveCheque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cheque: Omit<Cheque, "id" | "farmId"> & { id?: ID }) => repo.saveCheque(cheque),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.cheques });
      qc.invalidateQueries({ queryKey: qk.journal }); // it posts an entry
    },
  });
}

export function useSetChequeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      treasuryAccountId,
      date,
    }: {
      id: ID;
      status: ChequeStatus;
      treasuryAccountId?: ID;
      date?: string;
    }) => repo.setChequeStatus(id, status, { treasuryAccountId, date }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.cheques });
      qc.invalidateQueries({ queryKey: qk.journal });
    },
  });
}

/* --------------------------------- Stores ---------------------------------- */

export const useWarehouses = () =>
  useQuery({ queryKey: qk.warehouses, queryFn: () => repo.getWarehouses() });

export function useSaveWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (w: Omit<Warehouse, "id" | "farmId"> & { id?: ID }) => repo.saveWarehouse(w),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.warehouses }),
  });
}

/** Both of these change where stock sits, so the movement log must refresh. */
export function useTransferStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StockTransferInput) => repo.transferStock(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.movements });
      qc.invalidateQueries({ queryKey: qk.inventory });
    },
  });
}

export function useRecordStocktake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StocktakeInput) => repo.recordStocktake(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.movements });
      qc.invalidateQueries({ queryKey: qk.inventory });
    },
  });
}

/* --------------------------- Livestock transfers --------------------------- */

export const useLivestockTransfers = () =>
  useQuery({ queryKey: qk.livestockTransfers, queryFn: () => repo.getLivestockTransfers() });

export function useRecordLivestockTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LivestockTransferInput) => repo.recordLivestockTransfer(input),
    onSuccess: () => {
      // Animals changed pen, so anything keyed on the herd is now stale.
      qc.invalidateQueries({ queryKey: qk.livestockTransfers });
      qc.invalidateQueries({ queryKey: ["animals"] });
      qc.invalidateQueries({ queryKey: qk.zones });
    },
  });
}

/* -------------------------------- Production -------------------------------- */

export const useWorkOrders = () =>
  useQuery({ queryKey: qk.workOrders, queryFn: () => repo.getWorkOrders() });

export function useSaveWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (order: Omit<WorkOrder, "id" | "farmId" | "number"> & { id?: ID; number?: string }) =>
      repo.saveWorkOrder(order),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.workOrders }),
  });
}

export function useCompleteWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: ID) => repo.completeWorkOrder(id),
    onSuccess: () => {
      // Running an order moves stock in both lists and writes movements.
      qc.invalidateQueries({ queryKey: qk.workOrders });
      qc.invalidateQueries({ queryKey: qk.inventory });
      qc.invalidateQueries({ queryKey: qk.feedItems });
      qc.invalidateQueries({ queryKey: qk.movements });
    },
  });
}

/* ------------------------------ Organisation -------------------------------- */

export const useBranches = () =>
  useQuery({ queryKey: qk.branches, queryFn: () => repo.getBranches() });

export const useCurrencies = () =>
  useQuery({ queryKey: qk.currencies, queryFn: () => repo.getCurrencies() });

export function useSaveBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Omit<Branch, "id" | "farmId"> & { id?: ID }) => repo.saveBranch(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.branches }),
  });
}

export function useSaveCurrency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Omit<Currency, "id" | "farmId"> & { id?: ID }) => repo.saveCurrency(c),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.currencies }),
  });
}
