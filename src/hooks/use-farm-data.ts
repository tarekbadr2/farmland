"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRepository, type AnimalQuery } from "@/core/repositories";
import type { FarmTask, ID } from "@/core/domain/types";

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
  alerts: ["alerts"] as const,
  weather: ["weather"] as const,
  utilities: ["utilities"] as const,
  members: ["members"] as const,
  pendingInvites: ["pending-invites"] as const,
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
export const useAlerts = () => useQuery({ queryKey: qk.alerts, queryFn: () => repo.getAlerts() });
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
