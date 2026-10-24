import type { BudgetType } from "./types";

const CATEGORY_EMOJI_MAP: Record<string, string> = {
  nomina: "💼",
  reventa: "🔁",
  extra: "✨",
  comida: "🍽️",
  coche: "🚗",
  comerfuera: "🍔",
  ocio: "🎉",
  ropa: "👕",
  suscripciones: "📺",
  deporte: "🏃",
  viajes: "✈️",
  transporte: "🚌",
  regalo: "🎁",
  salud: "🏥",
  otros: "📦",
  fondosindexados: "📈",
  oro: "🥇",
  etfplata: "🥈",
  etfaged: "📊",
  etfxdwh: "📊",
  etfsxrs: "📊",
  etfiqqi: "📊",
  acciones: "🏢",
  crypto: "₿",
  sincategoria: "🏷️",
};

const TYPE_FALLBACK_EMOJI: Record<BudgetType, string> = {
  income: "💰",
  expense: "💸",
  saving: "🐖",
  investment: "📈",
};

export type CategoryEmojiOverrides = Record<string, string>;

/**
 * Key used to store a user-chosen emoji override for a given category, e.g.
 * in `State.categoryEmojis`. Stable across renames of the map above.
 */
export function categoryEmojiKey(type: BudgetType, category: string): string {
  return `${type}:${normalizeKey(String(category || ""))}`;
}

export function getCategoryEmoji(
  type: BudgetType,
  category: string,
  overrides?: CategoryEmojiOverrides,
): string {
  const cleanCategory = String(category || "").trim();
  if (!cleanCategory) {
    return TYPE_FALLBACK_EMOJI[type];
  }

  const override = overrides?.[categoryEmojiKey(type, cleanCategory)];
  if (override) {
    return override;
  }

  return (
    CATEGORY_EMOJI_MAP[normalizeKey(cleanCategory)] || TYPE_FALLBACK_EMOJI[type]
  );
}

export function decorateCategoryLabel(
  type: BudgetType,
  category: string,
  overrides?: CategoryEmojiOverrides,
): string {
  const cleanCategory = String(category || "").trim();
  if (!cleanCategory) {
    return `${TYPE_FALLBACK_EMOJI[type]} Sin categoría`;
  }

  return `${getCategoryEmoji(type, cleanCategory, overrides)} ${cleanCategory}`;
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
