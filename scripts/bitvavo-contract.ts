import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import {
  analyzeTransaction,
  captureHistory,
  ContractError,
  sanitizeTransaction,
  transactionSchema,
} from './lib/bitvavo-contract'

const localDirectory = '.scratch/bitvavo'

async function saveLocal(name: string, data: unknown) {
  await mkdir(localDirectory, { recursive: true, mode: 0o700 })
  await writeFile(`${localDirectory}/${name}.json`, JSON.stringify(data, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  })
}

function date(value: string | undefined): number {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Fecha requerida: YYYY-MM-DD')
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error('Fecha inválida')
  }
  return timestamp
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      from: { type: 'string' },
      to: { type: 'string' },
      'price-kind': { type: 'string' },
      help: { type: 'boolean' },
    },
  })
  if (values.help) {
    console.log('capture --from YYYY-MM-DD --to YYYY-MM-DD (fin exclusivo, UTC)')
    console.log('sanitize --price-kind unit|total (tras contrastar con Bitvavo)')
    return
  }
  if (positionals[0] === 'capture') {
    const key = process.env.BITVAVO_API_KEY
    const secret = process.env.BITVAVO_API_SECRET
    if (!key || !secret) throw new Error('Faltan BITVAVO_API_KEY y BITVAVO_API_SECRET')
    const fromDate = date(values.from)
    const toDate = date(values.to) - 1
    if (fromDate > toDate) throw new Error('Intervalo vacío o invertido')
    const transactions = await captureHistory({ key, secret, fromDate, toDate })
    await saveLocal('capture', transactions)
    await saveLocal(
      'analysis',
      transactions.map((transaction) => {
        try {
          return { transactionId: transaction.transactionId, ...analyzeTransaction(transaction) }
        } catch {
          return { transactionId: transaction.transactionId, status: 'incompatible' }
        }
      }),
    )
    console.log(
      `Capturados ${transactions.length} ejemplos locales; revisa ${localDirectory}/capture.json`,
    )
    console.log('Se conservan como máximo un ejemplo con comisión y otro sin comisión por lado.')
    return
  }
  if (positionals[0] === 'sanitize') {
    const priceKind = z.enum(['unit', 'total']).parse(values['price-kind'])
    const transactions = z
      .array(transactionSchema)
      .parse(JSON.parse(await readFile(`${localDirectory}/capture.json`, 'utf8')))
    if (
      !transactions.some((item) => item.type === 'buy') ||
      !transactions.some((item) => item.type === 'sell')
    ) {
      throw new Error('Se necesitan una compra y una venta reales')
    }
    const sanitized = transactions.map((item, index) => sanitizeTransaction(item, priceKind, index))
    await saveLocal('sanitized', {
      status: 'pending-human-verification',
      priceKind,
      transactions: sanitized,
      analysis: sanitized.map(analyzeTransaction),
    })
    console.log(
      `Ejemplos saneados en ${localDirectory}/sanitized.json; requieren revisión antes de versionar.`,
    )
    return
  }
  throw new Error('Usa capture o sanitize; consulta --help')
}

main().catch((error: unknown) => {
  // Never print provider bodies, schema errors or filesystem contents (may contain secrets).
  console.error(
    error instanceof ContractError
      ? error.message
      : 'No se pudo completar la captura/saneado. Comprueba argumentos, credenciales, permisos de lectura, conexión y archivos locales existentes. No se imprimen datos remotos.',
  )
  process.exitCode = 1
})
