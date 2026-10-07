import { scrypt as _scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(_scrypt);

const KEYLEN = 64;
const SALT_BYTES = 16;
// scrypt params: N=16384, r=8, p=1 (Node defaults)
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 } as const;

function parseStoredHash(stored: string): { salt: Buffer; derived: Buffer } | null {
  // format: scrypt:<saltHex>:<derivedHex>
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return null;
  try {
    return { salt: Buffer.from(parts[1], "hex"), derived: Buffer.from(parts[2], "hex") };
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(password, salt, KEYLEN, SCRYPT_OPTS)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parsed = parseStoredHash(storedHash);
  if (!parsed) return false;
  const derived = (await scryptAsync(password, parsed.salt, KEYLEN, SCRYPT_OPTS)) as Buffer;
  if (derived.length !== parsed.derived.length) return false;
  return timingSafeEqual(derived, parsed.derived);
}

// ---------------------------------------------------------------------------
// Single-admin credentials. Seeded from env — no registration endpoint exists.
// Supports either:
//   ADMIN_PASSWORD        (plaintext seed; hashed once per process at boot), or
//   ADMIN_PASSWORD_HASH   (precomputed `scrypt:...` hash — preferred in prod)
// ---------------------------------------------------------------------------
let cachedSeedHash: string | null = null;
let cachedSeedSource: string | null = null;

export function getAdminEmail(): string {
  return process.env.ADMIN_EMAIL ?? "";
}

async function getSeedHash(): Promise<string | null> {
  const fromHash = process.env.ADMIN_PASSWORD_HASH;
  if (fromHash && fromHash.startsWith("scrypt:")) return fromHash;

  const plain = process.env.ADMIN_PASSWORD ?? "";
  if (!plain) return null;
  // Hash once per process so scrypt's random salt stays stable for comparison.
  if (cachedSeedHash && cachedSeedSource === plain) return cachedSeedHash;
  cachedSeedHash = await hashPassword(plain);
  cachedSeedSource = plain;
  return cachedSeedHash;
}

/** Compare a login attempt against the seeded admin credentials. */
export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  const expectedEmail = getAdminEmail();
  if (!expectedEmail || !password) return false;
  // Constant-time email comparison to avoid leaking which field failed.
  const a = Buffer.from(email.trim().toLowerCase());
  const b = Buffer.from(expectedEmail.trim().toLowerCase());
  const emailOk = a.length === b.length && timingSafeEqual(a, b);
  const seedHash = await getSeedHash();
  if (!seedHash) return false;
  const passOk = await verifyPassword(password, seedHash);
  return emailOk && passOk;
}
