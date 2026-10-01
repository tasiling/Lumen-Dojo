import "server-only";

const localQueues = new Map<string, Promise<void>>();
function baseUrl() { return process.env.CONTEXT_ROOM_INTEGRATION_URL?.trim() || process.env.CONTEXT_ROOM_URL?.trim() || "https://lumen-context-room-production-4a2c.up.railway.app"; }
function secret() { return process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET?.trim() || ""; }

export async function withIntegrationMutationLease<T>(resource: string, work: () => Promise<T>): Promise<T> {
  const token = secret();
  if (!token) {
    const previous = localQueues.get(resource) || Promise.resolve(); let release!: () => void;
    const queued = new Promise<void>((resolve) => { release = resolve; }); localQueues.set(resource, queued);
    await previous; try { return await work(); } finally { release(); if (localQueues.get(resource) === queued) localQueues.delete(resource); }
  }
  const leaseOwner = crypto.randomUUID();
  const response = await fetch(new URL("/api/integrations/lumen/mutation-leases", baseUrl()), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "acquire", resource, leaseOwner, ttlMs: 30000 }), cache: "no-store", signal: AbortSignal.timeout(10000) });
  const lease = await response.json().catch(() => ({})) as { fence?: number; error?: string };
  if (!response.ok || !lease.fence) throw new Error(lease.error || "無法取得資料更新租約");
  try { return await work(); }
  finally { await fetch(new URL("/api/integrations/lumen/mutation-leases", baseUrl()), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "release", resource, leaseOwner, fence: lease.fence }), cache: "no-store", signal: AbortSignal.timeout(5000) }).catch(() => undefined); }
}
