/**
 * Versioned AES-GCM data-encryption layer (WP12).
 *
 * Encrypts/decrypts small secret strings (today: the Stock Events API key,
 * stored in `integration_credentials.ciphertext`) using the Web Crypto API,
 * which is available in both Cloudflare Workers (production) and Node's
 * `node:crypto` webcrypto shim (unit tests) — no extra dependency needed.
 *
 * Key material comes from env vars, never hard-coded:
 * - `DATA_ENCRYPTION_KEY`: base64-encoded 32-byte (AES-256-GCM) key, the
 *   *active* key used for all new encryptions.
 * - `DATA_ENCRYPTION_KEY_VERSION`: integer version number of the active key
 *   (defaults to `1` when unset). Bump this — together with rotating
 *   `DATA_ENCRYPTION_KEY` — to rotate keys.
 * - `DATA_ENCRYPTION_KEY_PREVIOUS` (optional): base64-encoded key for
 *   `DATA_ENCRYPTION_KEY_VERSION - 1`, kept only long enough to decrypt rows
 *   still encrypted under the previous key until a re-encryption pass runs.
 *   Every ciphertext this module produces records its own key version
 *   alongside it (the repository layer persists it in `key_version`), so a
 *   rotation never requires re-encrypting everything atomically.
 *
 * Ciphertext envelope: `"<base64 iv>.<base64 AES-GCM output>"` — the GCM
 * output already includes the authentication tag, Web Crypto appends it to
 * the ciphertext bytes. The envelope never embeds the plaintext or the key.
 */

const ALGORITHM = "AES-GCM";
const IV_BYTES = 12;
const EXPECTED_KEY_BYTES = 32; // AES-256

export interface DataEncryptionEnv {
  DATA_ENCRYPTION_KEY?: string;
  DATA_ENCRYPTION_KEY_PREVIOUS?: string;
  DATA_ENCRYPTION_KEY_VERSION?: string;
}

export interface EncryptedEnvelope {
  /** `"<base64 iv>.<base64 ciphertext+tag>"`. Never contains plaintext. */
  ciphertext: string;
  /** Key version this envelope was encrypted under. */
  keyVersion: number;
}

export class DataEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataEncryptionError";
  }
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Resolves `DATA_ENCRYPTION_KEY_VERSION`, defaulting to `1` when unset. */
export function resolveActiveKeyVersion(env: DataEncryptionEnv): number {
  const raw = env.DATA_ENCRYPTION_KEY_VERSION;
  if (!raw) {
    return 1;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new DataEncryptionError(
      `DATA_ENCRYPTION_KEY_VERSION debe ser un entero positivo, recibido: ${raw}`,
    );
  }
  return parsed;
}

/** Picks the raw base64 key material for a given key version. */
function resolveKeyMaterial(env: DataEncryptionEnv, keyVersion: number): string {
  const activeVersion = resolveActiveKeyVersion(env);
  if (keyVersion === activeVersion) {
    if (!env.DATA_ENCRYPTION_KEY) {
      throw new DataEncryptionError("DATA_ENCRYPTION_KEY no está configurada.");
    }
    return env.DATA_ENCRYPTION_KEY;
  }
  if (keyVersion === activeVersion - 1 && env.DATA_ENCRYPTION_KEY_PREVIOUS) {
    return env.DATA_ENCRYPTION_KEY_PREVIOUS;
  }
  throw new DataEncryptionError(
    `No hay material de clave disponible para key_version=${keyVersion} (versión activa: ${activeVersion}).`,
  );
}

// Importing a raw key into a `CryptoKey` is async; cache per (version, raw
// key string) so repeated encrypt/decrypt calls within a request don't
// re-import on every call. Keyed by value (not just version) so a rotated
// env var never accidentally serves a stale cached key.
const keyCache = new Map<string, Promise<CryptoKey>>();

async function importKey(rawBase64: string): Promise<CryptoKey> {
  const cached = keyCache.get(rawBase64);
  if (cached) {
    return cached;
  }
  const promise = (async () => {
    let bytes: Uint8Array;
    try {
      bytes = base64Decode(rawBase64);
    } catch {
      throw new DataEncryptionError("La clave de cifrado no es base64 válido.");
    }
    if (bytes.byteLength !== EXPECTED_KEY_BYTES) {
      throw new DataEncryptionError(
        `La clave de cifrado debe decodificar a ${EXPECTED_KEY_BYTES} bytes (AES-256), recibidos: ${bytes.byteLength}.`,
      );
    }
    return crypto.subtle.importKey("raw", bytes as BufferSource, { name: ALGORITHM }, false, [
      "encrypt",
      "decrypt",
    ]);
  })();
  keyCache.set(rawBase64, promise);
  return promise;
}

/** Encrypts `plaintext` under the currently active key version. */
export async function encryptValue(
  env: DataEncryptionEnv,
  plaintext: string,
): Promise<EncryptedEnvelope> {
  const keyVersion = resolveActiveKeyVersion(env);
  const rawKey = resolveKeyMaterial(env, keyVersion);
  const key = await importKey(rawKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);
  const ciphertext = `${base64Encode(iv)}.${base64Encode(new Uint8Array(cipherBuffer))}`;
  return { ciphertext, keyVersion };
}

/** Decrypts an envelope produced by {@link encryptValue}. */
export async function decryptValue(
  env: DataEncryptionEnv,
  envelope: EncryptedEnvelope,
): Promise<string> {
  const [ivPart, cipherPart] = envelope.ciphertext.split(".");
  if (!ivPart || !cipherPart) {
    throw new DataEncryptionError("Formato de ciphertext inválido.");
  }
  const rawKey = resolveKeyMaterial(env, envelope.keyVersion);
  const key = await importKey(rawKey);
  const iv = base64Decode(ivPart);
  const cipherBytes = base64Decode(cipherPart);
  try {
    const plainBuffer = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: iv as BufferSource },
      key,
      cipherBytes as BufferSource,
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    throw new DataEncryptionError("No se pudo descifrar el valor (clave incorrecta o dato corrupto).");
  }
}
