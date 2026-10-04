import type { Instrument } from '../../scripts/types'

/** How an instrument type reads in the interface. */
export const INSTRUMENT_TYPE_LABEL: Record<Instrument['type'], string> = {
  stock: 'Acción',
  etf: 'ETF',
  fund: 'Fondo',
  crypto: 'Cripto',
}

/** Quote providers an instrument can use, as the selects list them. */
export const QUOTE_PROVIDERS = [
  { value: 'twelve-data', label: 'Twelve Data' },
  { value: 'yahoo', label: 'Yahoo Finance' },
  { value: 'coingecko', label: 'CoinGecko' },
] as const

export function providerLabel(provider: string): string {
  return QUOTE_PROVIDERS.find((item) => item.value === provider)?.label ?? provider
}
