/** Constants for the Conventions page. */
// Type-only import: client code never value-imports @devdigest/shared (Next can't bundle its `.js` specifiers).
import type { ConventionStatus } from "@devdigest/shared";

export type StatusFilter = "all" | ConventionStatus;

/** Filter chips, in display order. */
export const STATUS_FILTERS: readonly StatusFilter[] = ["all", "pending", "accepted", "rejected"];

export const SKELETON_CARDS = 3;

/** Confidence bar colour thresholds (percent): ≥ OK green, ≥ WARN amber, else red. */
export const CONFIDENCE_OK = 85;
export const CONFIDENCE_WARN = 60;
