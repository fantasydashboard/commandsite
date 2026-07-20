// CommandSite · app-layer token encryption (AES-256-GCM)
// ---------------------------------------------------------------------------
// PCO OAuth tokens are the highest-sensitivity credentials CommandSite holds:
// a leaked refresh token exposes a church's entire congregant database. We
// encrypt them BEFORE they touch Postgres, with a key that lives only in edge
// function secrets, so a database dump (or a mis-scoped query that somehow got
// past RLS) yields ciphertext, not tokens.
//
// Scheme: AES-256-GCM. Output is base64(iv[12] || ciphertext+tag), a single
// self-describing string safe to store in a text column.
//
// Key: TOKEN_ENC_KEY edge secret — 32 raw bytes, base64-encoded. Generate with:
//   openssl rand -base64 32
// Keep it out of git and out of the frontend bundle. If it is ever rotated,
// existing rows must be re-encrypted (decrypt with old key, encrypt with new);
// losing it makes stored tokens unrecoverable (churches just reconnect).

// deno-lint-ignore no-explicit-any
declare const Deno: any

const IV_BYTES = 12 // GCM standard nonce length

function b64decode(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function b64encode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

let cachedKey: CryptoKey | null = null

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  const raw = Deno.env.get('TOKEN_ENC_KEY')
  if (!raw) {
    throw new Error(
      'TOKEN_ENC_KEY secret is not set. Generate one with `openssl rand -base64 32` ' +
        'and add it to the Edge Function secrets before connecting Planning Center.',
    )
  }
  const keyBytes = b64decode(raw)
  if (keyBytes.length !== 32) {
    throw new Error(`TOKEN_ENC_KEY must decode to 32 bytes (got ${keyBytes.length}). Use \`openssl rand -base64 32\`.`)
  }
  cachedKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  return cachedKey
}

// Encrypt a token string -> base64(iv || ciphertext+tag).
export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const enc = new TextEncoder().encode(plaintext)
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc))
  const packed = new Uint8Array(iv.length + cipher.length)
  packed.set(iv, 0)
  packed.set(cipher, iv.length)
  return b64encode(packed)
}

// Decrypt base64(iv || ciphertext+tag) -> token string.
export async function decryptToken(packed: string): Promise<string> {
  const key = await getKey()
  const bytes = b64decode(packed)
  const iv = bytes.slice(0, IV_BYTES)
  const cipher = bytes.slice(IV_BYTES)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
  return new TextDecoder().decode(plain)
}
