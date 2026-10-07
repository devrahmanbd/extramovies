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
    const fwd = input.headers.get("x-forwarded-for") ?? "";
    if (fwd) return fwd.split(",")[0]!.trim();
    return "unknown";
  }
  const obj = (input ?? {}) as LegacyReqLike & {
    request?: Request;
    clientAddress?: string;
  };
  // Astro APIContext shape: { request, clientAddress }.
  if (obj.request instanceof Request) return getClientIp(obj.request);
  if (typeof obj.clientAddress === "string" && obj.clientAddress) return obj.clientAddress;
  const fwd = headerValue(obj.headers as Record<string, unknown> | Headers | undefined, "x-forwarded-for");
  if (fwd.length > 0) return fwd.split(",")[0]!.trim();
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
