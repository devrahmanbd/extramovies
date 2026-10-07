/**
 * jobs.ts — shared in-memory ReviewJob store singleton.
 * Single-process fallback: keeps generate-review <-> regenerate consistent
 * without route-to-route imports. The DB owner replaces getJobStore()
 * with a persistent adapter; pipeline code stays unchanged.
 */
import { createMemoryJobStore, type JobStore } from "./pipeline";

let singleton: (JobStore & { all(): unknown[] }) | null = null;

export function getJobStore(): JobStore {
  if (!singleton) singleton = createMemoryJobStore();
  return singleton;
}

/** Test/ops override — lets the DB owner inject a persistent store. */
export function setJobStore(store: JobStore): void {
  singleton = store as JobStore & { all(): unknown[] };
}
