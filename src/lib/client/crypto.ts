/**
 * Web Crypto key handling for the client-side cache (WP7).
 *
 * The AES-GCM key is generated `extractable: false` and stored as a
 * `CryptoKey` object directly in IndexedDB (structured-clone-able,
 * non-exportable) — the raw key material never exists as a JS string/array
 * buffer the app (or an XSS payload) could read out. Logout wipes the key
 * database, making any previously-encrypted cache entries permanently
 * unreadable even if the cache database itself somehow survived.
 *
 * This is defense-in-depth for the IndexedDB cache at rest on the device,
 * not a replacement for WP12's server-side `integration_credentials`
 * encryption — those are separate concerns.
 *
 * Every operation is an `Effect` with a typed `ClientStorageError`: opening
 * IndexedDB, generating the key and encrypting/decrypting can all fail, and
 * the caller (logout, the cache) handles that failure explicitly.
 */

import { Effect } from 'effect'

import { attemptStorage, storageError } from './storage'
import type { ClientStorageError } from './storage'

const DB_VERSION = 1
const STORE = 'keys'
const KEY_RECORD_ID = 'cache-key'

export interface EncryptedPayload {
  iv: string // base64
  ciphertext: string // base64
}

function dbNameFor(userId: string): string {
  return `finance-tracker-keys-v2:${userId}`
}

function openKeyDb(userId: string): Effect.Effect<IDBDatabase, ClientStorageError> {
  return attemptStorage('No se pudo abrir el almacén de claves.', () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbNameFor(userId), DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(request.error ?? new Error('No se pudo abrir el almacén de claves.'))
    })
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Fallo al acceder a la clave.'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Fallo en transacción de claves.'))
    tx.onabort = () => reject(tx.error ?? new Error('Transacción de claves abortada.'))
  })
}

async function loadStoredKey(db: IDBDatabase): Promise<CryptoKey | undefined> {
  const tx = db.transaction(STORE, 'readonly')
  const row = await requestToPromise(
    tx.objectStore(STORE).get(KEY_RECORD_ID) as IDBRequest<
      { id: string; key: CryptoKey } | undefined
    >,
  )
  await txDone(tx)
  return row?.key
}

async function storeKey(db: IDBDatabase, key: CryptoKey): Promise<void> {
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put({ id: KEY_RECORD_ID, key })
  await txDone(tx)
}

/** Returns the per-user non-extractable AES-GCM key, generating it on first use. */
export const getOrCreateEncryptionKey = (
  userId: string,
): Effect.Effect<CryptoKey, ClientStorageError> =>
  Effect.gen(function* () {
    const db = yield* openKeyDb(userId)
    try {
      const existing = yield* attemptStorage('No se pudo leer la clave de cifrado.', () =>
        loadStoredKey(db),
      )
      if (existing) {
        return existing
      }
      const key = yield* attemptStorage('No se pudo generar la clave de cifrado.', () =>
        crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
      )
      yield* attemptStorage('No se pudo guardar la clave de cifrado.', () => storeKey(db, key))
      return key
    } finally {
      db.close()
    }
  })

function toBase64(bytes: ArrayBuffer): string {
  const array = new Uint8Array(bytes)
  let binary = ''
  for (const byte of array) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** Encrypts a UTF-8 string with a fresh random IV per call. */
export const encryptText = (
  key: CryptoKey,
  plaintext: string,
): Effect.Effect<EncryptedPayload, ClientStorageError> =>
  Effect.gen(function* () {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(plaintext)
    const ciphertext = yield* attemptStorage('No se pudo cifrar el contenido.', () =>
      crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded),
    )
    return { iv: toBase64(iv.buffer), ciphertext: toBase64(ciphertext) }
  })

/** Decrypts a payload produced by `encryptText` with the same key. */
export const decryptText = (
  key: CryptoKey,
  payload: EncryptedPayload,
): Effect.Effect<string, ClientStorageError> =>
  Effect.gen(function* () {
    const iv = fromBase64(payload.iv)
    const ciphertext = fromBase64(payload.ciphertext)
    const plainBuffer = yield* attemptStorage('No se pudo descifrar el contenido.', () =>
      crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext),
    )
    return new TextDecoder().decode(plainBuffer)
  })

/** Deletes the per-user key database, permanently destroying the key (logout). */
export const wipeEncryptionKey = (userId: string): Effect.Effect<void, ClientStorageError> =>
  Effect.tryPromise({
    try: () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbNameFor(userId))
        request.onsuccess = () => resolve(undefined)
        request.onerror = () =>
          reject(request.error ?? new Error('No se pudo borrar la clave de cifrado.'))
        request.onblocked = () =>
          reject(new Error('Otra pestaña mantiene abierta la clave IndexedDB.'))
      }),
    catch: (cause) => storageError(cause, 'No se pudo borrar la clave de cifrado.'),
  })
