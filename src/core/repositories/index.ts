import { DemoFarmRepository } from "./demo-repository";
import { FirebaseFarmRepository } from "@/infrastructure/firebase/firebase-repository";
import { isFirebaseConfigured } from "@/infrastructure/firebase/client";
import type { FarmRepository } from "./farm-repository";

let instance: FarmRepository | null = null;

export function isFirebaseBackend() {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === "firebase" && isFirebaseConfigured;
}

/**
 * Single entry point for data access.
 *
 * `NEXT_PUBLIC_DATA_SOURCE=firebase` plus the keys in `.env.local` swaps the
 * whole backend. Anything else — including a half-filled config — falls back to
 * the demo adapter, so a bad env var degrades to a working demo rather than a
 * white screen in front of a customer.
 */
export function getRepository(): FarmRepository {
  if (instance) return instance;
  instance = isFirebaseBackend() ? new FirebaseFarmRepository() : new DemoFarmRepository();
  return instance;
}

export type { FarmRepository, AnimalQuery, Page } from "./farm-repository";
export { invoiceTotal } from "./farm-repository";
