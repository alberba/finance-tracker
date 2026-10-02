export function evaluateNumericExpression(expression: string): number | null {
  const raw = String(expression || "").trim();
  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/,/g, ".");
  if (!/^[0-9+\-*/().\s]+$/.test(normalized)) {
    return null;
  }
  if (!/[0-9]/.test(normalized)) {
    return null;
  }

  try {
    const result = Function(`"use strict"; return (${normalized});`)();
    const numeric = Number(result);
    return Number.isFinite(numeric) ? numeric : null;
  } catch {
    return null;
  }
}
