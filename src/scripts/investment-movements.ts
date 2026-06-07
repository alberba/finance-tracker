import { parseFloatSafe, round2 } from "./utils";
import { isInvestmentSide, type InvestmentSide } from "./types";

export interface InvestmentDraftInput {
  side: InvestmentSide;
  symbol: string;
  units: number;
  unitPrice: number;
  fee: number;
}

export interface InvestmentComputedFields {
  normalizedSymbol: string;
  normalizedUnits: number;
  normalizedUnitPrice: number;
  normalizedFee: number;
  signedAmount: number;
  description: string;
}

export function computeInvestmentMovement(
  input: InvestmentDraftInput,
): InvestmentComputedFields {
  const normalizedSymbol = normalizeInvestmentSymbol(input.symbol);
  const normalizedUnits = normalizeNonNegative(input.units, 8);
  const normalizedUnitPrice = normalizeNonNegative(input.unitPrice, 6);
  const normalizedFee = normalizeNonNegative(input.fee, 2);
  const grossAmount = round2(
    normalizedUnits * normalizedUnitPrice + normalizedFee,
  );
  const signedAmount =
    input.side === "sell" ? round2(-grossAmount) : grossAmount;

  return {
    normalizedSymbol,
    normalizedUnits,
    normalizedUnitPrice,
    normalizedFee,
    signedAmount,
    description: buildInvestmentDescription(
      input.side,
      normalizedUnits,
      normalizedSymbol,
    ),
  };
}

export function normalizeInvestmentSide(value: unknown): InvestmentSide {
  const candidate = String(value || "").trim();
  if (isInvestmentSide(candidate)) {
    return candidate;
  }
  return "buy";
}

export function normalizeInvestmentSymbol(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase();
}

export function buildInvestmentDescription(
  side: InvestmentSide,
  units: number,
  symbol: string,
): string {
  const action = side === "sell" ? "Venta" : "Compra";
  return `${action} ${formatUnits(units)} ${symbol}`.trim();
}

export function parseTransactionYear(value: unknown): number | null {
  const date = String(value || "").trim();
  const match = date.match(/^(\d{4})-\d{2}-\d{2}$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : null;
}

function normalizeNonNegative(value: unknown, decimals: number): number {
  const parsed = roundWithPrecision(parseFloatSafe(value, 0), decimals);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function roundWithPrecision(value: number, decimals: number): number {
  const safeDecimals = Math.max(0, Math.min(10, Math.floor(decimals)));
  const factor = 10 ** safeDecimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function formatUnits(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = roundWithPrecision(value, 8);
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}
