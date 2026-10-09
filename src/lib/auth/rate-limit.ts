// Framework-free rate limit (no "next" import). Legacy Next-style req and
// Astro Request/APIContext are both accepted via overloads.
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

// In-memory sliding window per IP. Resets on successful login.
// TODO(foundation): move to shared store (Redis) when scaling past 1 instance.
const attempts = new Map<string, number[]>();

interface LegacyReqLike {
  headers?: Record<string, unknown> | Headers;
  socket?: { remoteAddress?: string };
  [key: string]: unknown;
}

function isPrivateIp(ip: string): boolean {
  const v = ip.trim();
  if (v === "::1" || v.toLowerCase() === "localhost") return true;
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * Client IP from an X-Forwarded-For chain. Each proxy appends the address it
 * sees, so attacker-controlled prefixes are ignored: strip private hops
 * (added by our own edge/proxies) and take the last remaining entry — the
 * closest address our edge actually observed. Falls back to "" (caller uses
 * the socket address) when nothing usable remains.
 */
function clientIpFromForwarded(fwd: string): string {
  const parts = fwd
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !isPrivateIp(s));
  return parts.length > 0 ? parts[parts.length - 1]! : "";
}
function headerValue(
  headers: Record<string, unknown> | Headers | undefined,
  name: string,
): string {
  if (!headers) return "";
  if (headers instanceof Headers) return headers.get(name) ?? "";
  const v = (headers as Record<string, unknown>)[name];
  return typeof v === "string" ? v : "";
}

export function getClientIp(req: LegacyReqLike): string;
export function getClientIp(request: Request): string;
export function getClientIp(context: { request?: Request; clientAddress?: string }): string;
export function getClientIp(input: unknown): string {
  if (input instanceof Request) {
    const resolved = clientIpFromForwarded(input.headers.get("x-forwarded-for") ?? "");
    return resolved || "unknown";
  }
  const obj = (input ?? {}) as LegacyReqLike & {
    request?: Request;
    clientAddress?: string;
  };
  // Astro APIContext shape: { request, clientAddress }.
  if (obj.request instanceof Request) return getClientIp(obj.request);
  if (typeof obj.clientAddress === "string" && obj.clientAddress) return obj.clientAddress;
  const fwd = headerValue(obj.headers as Record<string, unknown> | Headers | undefined, "x-forwarded-for");
  const resolved = clientIpFromForwarded(fwd);
  if (resolved) return resolved;
  return (obj.socket?.remoteAddress ?? "unknown").toString();
}

function prune(ip: string, now: number): number[] {
  const list = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  attempts.set(ip, list);
  return list;
}

export function isRateLimited(ip: string): boolean {
  return prune(ip, Date.now()).length >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(ip: string): void {
  const list = prune(ip, Date.now());
  list.push(Date.now());
  attempts.set(ip, list);
}

export function resetAttempts(ip: string): void {
  attempts.delete(ip);
}
