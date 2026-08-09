/**
 * Canonical money/decimal layer (WP2).
 *
 * Purpose: convert between the domain layer's float amounts and the
 * integer-minimal-unit representation used at the v2 storage/API boundary
 * (D1 `INTEGER` money columns + a separate ISO `currency` column, per WP1's
 * "never REAL" design decision).
 *
 * Scope decision (per work-packages.md WP2): this module is a *boundary*
 * concern only. `src/domain/**` and `src/lib/finance-core.ts` keep operating
 * on floats internally; conversion to/from minimal units happens only when
 * v2 repositories (WP6) read from or write to D1. This module does not
 * change any existing call site.
 *
 * Canonical `round2` import path decision (WP2, resolves the "three
 * re-export paths" finding so WP6 doesn't re-litigate it): the source of
 * truth is `src/lib/number.ts`. `src/lib/finance-core.ts` and
 * `src/scripts/utils.ts` merely re-export it. New code should import
 * `round2` from `src/lib/number.ts` directly.
 *
 * `round8` (crypto-unit rounding in `src/domain/investment/valuation.ts`)
 * is a distinct, float-based display concern and is intentionally NOT
 * unified with this integer-minimal-unit layer.
 */

import Decimal from "decimal.js";

/**
 * Number of decimal digits a currency's minor unit represents, keyed by
 * ISO 4217 code (or an internal pseudo-code for crypto assets tracked with
 * higher precision, e.g. "BTC"). Defaults to 2 (the common case) when a
 * currency is not listed here.
 */
const MINOR_UNIT_EXPONENTS: Record<string, number> = {
  EUR: 2,
  USD: 2,
  GBP: 2,
  JPY: 0,
  KWD: 3,
  BTC: 8,
  ETH: 8,
};

const DEFAULT_MINOR_UNIT_EXPONENT = 2;

/**
 * Returns how many decimal digits the given ISO currency's minor unit has
 * (e.g. 2 for EUR cents, 0 for JPY, 8 for BTC-style high-precision assets).
 */
export function minorUnitExponent(currency: string): number {
  const code = currency.trim().toUpperCase();
  return MINOR_UNIT_EXPONENTS[code] ?? DEFAULT_MINOR_UNIT_EXPONENT;
}

/**
 * Converts a decimal amount (as used by the domain layer, e.g. 12.34 EUR)
 * into the integer minimal-unit representation used for storage (e.g. 1234
 * cents). Rounds half-up to the currency's minor-unit exponent.
 *
 * Returns a JS `number`. This is intentional: D1/SQLite `INTEGER` columns
 * and the D1 client bind plain numbers cleanly for the amounts this app
 * deals with (well within `Number.MAX_SAFE_INTEGER`); introducing `bigint`
 * would spread through the repository/API layer for no practical benefit
 * at this app's scale.
 */
export function toMinorUnits(amount: number | string, currency: string): number {
  const exponent = minorUnitExponent(currency);
  const minor = new Decimal(amount).times(new Decimal(10).pow(exponent)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return minor.toNumber();
}

/**
 * Converts an integer minimal-unit amount (e.g. 1234 cents) back into a
 * decimal amount (e.g. 12.34) for the given ISO currency. This is the
 * inverse of `toMinorUnits`.
 */
export function fromMinorUnits(minor: number, currency: string): number {
  const exponent = minorUnitExponent(currency);
  return new Decimal(minor).dividedBy(new Decimal(10).pow(exponent)).toNumber();
}
