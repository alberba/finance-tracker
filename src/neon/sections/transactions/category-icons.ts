import type { TransactionType } from '../../../scripts/types'

// Line icons (24×24 paths, DESIGN.md «Iconografía») for the category circle of
// a ledger row. Categories are the user's own, so a few usual names get their
// own icon and every other one falls back to its movement type's.

const BY_TYPE: Record<TransactionType, string> = {
  expense: 'M12 5v14M19 12l-7 7-7-7',
  income: 'M12 19V5M5 12l7-7 7 7',
  saving: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13',
  investment: 'M3 17l6-6 4 4 8-8M15 7h6v6',
}

const BY_NAME: ReadonlyArray<[RegExp, string]> = [
  [
    /s[uú]per|comida|mercado|compra/,
    'M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L20 8H6M9 20h.01M17 20h.01',
  ],
  [
    /comer fuera|restaurante|cena/,
    'M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9',
  ],
  [
    /transporte|coche|gasolina|viaje/,
    'M5 17V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v11M5 11h14M7 21v-2M17 21v-2M5 17h14',
  ],
  [/casa|alquiler|hogar|hipoteca/, 'M3 11l9-7 9 7M5 10v10h14V10'],
  [/ocio|suscrip/, 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  [
    /salud|farmacia|m[eé]dico/,
    'M20.8 8.6a5 5 0 0 0-8.8-3.2A5 5 0 0 0 3.2 8.6C3.2 14 12 20 12 20s8.8-6 8.8-11.4z',
  ],
  [/n[oó]mina|sueldo|salario/, 'M4 7h16v12H4zM9 7V5h6v2'],
  [/regalo/, 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13'],
  [
    /cripto|crypto|bitcoin/,
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  ],
]

export function categoryIcon(type: TransactionType, category: string): string {
  const name = category.toLowerCase()
  return BY_NAME.find(([pattern]) => pattern.test(name))?.[1] ?? BY_TYPE[type]
}
