import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  decryptText,
  encryptText,
  getOrCreateEncryptionKey,
  wipeEncryptionKey,
} from '../helpers/client-storage'

const USER_ID = 'user-crypto-test'

describe('client crypto', () => {
  beforeEach(async () => {
    await wipeEncryptionKey(USER_ID)
  })

  it('generates a non-extractable AES-GCM key', async () => {
    const key = await getOrCreateEncryptionKey(USER_ID)
    expect(key.algorithm.name).toBe('AES-GCM')
    expect(key.extractable).toBe(false)
  })

  it('returns the same key across calls for the same user', async () => {
    const key1 = await getOrCreateEncryptionKey(USER_ID)
    const key2 = await getOrCreateEncryptionKey(USER_ID)
    const plaintext = 'dato sensible'
    const encrypted = await encryptText(key1, plaintext)
    const decrypted = await decryptText(key2, encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it('scopes keys per user id', async () => {
    const otherUser = `${USER_ID}-other`
    await wipeEncryptionKey(otherUser)
    const keyA = await getOrCreateEncryptionKey(USER_ID)
    const keyB = await getOrCreateEncryptionKey(otherUser)
    const encrypted = await encryptText(keyA, 'solo para A')
    await expect(decryptText(keyB, encrypted)).rejects.toThrow()
    await wipeEncryptionKey(otherUser)
  })

  it('produces different ciphertext for the same plaintext (random IV)', async () => {
    const key = await getOrCreateEncryptionKey(USER_ID)
    const first = await encryptText(key, 'repetido')
    const second = await encryptText(key, 'repetido')
    expect(first.iv).not.toEqual(second.iv)
    expect(first.ciphertext).not.toEqual(second.ciphertext)
  })

  it('wipeEncryptionKey makes a subsequent getOrCreate generate a fresh key', async () => {
    const key1 = await getOrCreateEncryptionKey(USER_ID)
    const encrypted = await encryptText(key1, 'antes del logout')
    await wipeEncryptionKey(USER_ID)
    const key2 = await getOrCreateEncryptionKey(USER_ID)
    await expect(decryptText(key2, encrypted)).rejects.toThrow()
  })
})
