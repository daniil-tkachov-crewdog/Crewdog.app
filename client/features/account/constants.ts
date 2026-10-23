// src/constants/account.ts
//
// Default search allowances per plan, used when a billing summary arrives
// without an explicit cap on it.
//
// These values are mirrored from src/services/account.ts, which declares them
// privately and is the module the running app actually uses. They live here as
// well because src/utils/account.ts imports them from this path, and this file
// did not exist — so that import had been dangling.
//
// Keep the two in step. The duplication is deliberate scaffolding, not a
// design: see docs/RESTRUCTURE.md §4.4, which folds both copies into one when
// the account code moves under a single feature folder.

/** Searches a signed-in user gets on the free plan. */
export const FREE_CAP = 3;

/**
 * Fallback allowance for a paid subscriber whose plan could not be inferred
 * from its Stripe price. Current Pro (£19.50/mo) is unlimited and never
 * reaches this; it covers legacy and unrecognised plans only.
 */
export const PRO_CAP = 25;
