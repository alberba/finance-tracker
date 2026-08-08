/**
 * UUIDv7 generator (WP1).
 *
 * Used as the server-generated primary key for every v2 table (per WP1's
 * "UUIDv7 generated server-side for all PKs" design decision). UUIDv7 embeds
 * a 48-bit millisecond Unix timestamp in the leading bytes, so IDs sort
 * lexicographically/chronologically — useful for `(user_id, id)` range scans
 * and avoids the index fragmentation of random UUIDv4 PKs.
 *
 * No extra dependency: the algorithm (RFC 9562 §5.7) is a handful of bit
 * operations over `crypto.getRandomValues`, which is available both in
 * Node.js and the Cloudflare Workers runtime.
 */

const HEX = "0123456789abcdef";

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += HEX[byte >> 4] + HEX[byte & 0x0f];
  }
  return out;
}

/**
 * Generates a new UUIDv7 string, e.g. `018f4d3e-2a4b-7c1a-8b2e-1234567890ab`.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const now = BigInt(Date.now());
  bytes[0] = Number((now >> 40n) & 0xffn);
  bytes[1] = Number((now >> 32n) & 0xffn);
  bytes[2] = Number((now >> 24n) & 0xffn);
  bytes[3] = Number((now >> 16n) & 0xffn);
  bytes[4] = Number((now >> 8n) & 0xffn);
  bytes[5] = Number(now & 0xffn);

  // Version 7 in the high nibble of byte 6.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // Variant "10" in the top two bits of byte 8.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = toHex(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
