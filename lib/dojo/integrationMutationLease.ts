import "server-only";

const localQueues = new Map<string, Promise<void>>();
const LEASE_TTL_MS = 30_000;
const HEARTBEAT_MS = 10_000;

function baseUrl() {
  return process.env.CONTEXT_ROOM_INTEGRATION_URL?.trim()
    || process.env.CONTEXT_ROOM_URL?.trim()
    || "https://lumen-context-room-production-4a2c.up.railway.app";
}

function secret() {
  return process.env.LUMEN_CONTEXT_ROOM_SYNC_SECRET?.trim() || "";
}

type MutationLeaseGuard = {
  fence: number;
  assertCurrent: () => Promise<void>;
};

async function mutationLeaseRequest(body: Record<string, unknown>) {
  const response = await fetch(new URL("/api/integrations/lumen/mutation-leases", baseUrl()), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret()}` },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json().catch(() => ({})) as { fence?: number; error?: string; code?: string };
  if (!response.ok || !result.fence) throw new Error(result.error || result.code || "資料更新租約操作失敗");
  return result;
}

export async function withIntegrationMutationLease<T>(
  resource: string,
  work: (guard: MutationLeaseGuard) => Promise<T>,
): Promise<T> {
  const token = secret();
  if (!token) {
    const previous = localQueues.get(resource) || Promise.resolve();
    let release!: () => void;
    const queued = new Promise<void>((resolve) => { release = resolve; });
    localQueues.set(resource, queued);
    await previous;
    try {
      return await work({ fence: 1, assertCurrent: async () => undefined });
    } finally {
      release();
      if (localQueues.get(resource) === queued) localQueues.delete(resource);
    }
  }

  const leaseOwner = crypto.randomUUID();
  const lease = await mutationLeaseRequest({ action: "acquire", resource, leaseOwner, ttlMs: LEASE_TTL_MS });
  const fence = lease.fence!;
  let lost: Error | null = null;
  let renewal = Promise.resolve();
  const renew = () => {
    renewal = renewal.then(async () => {
      if (lost) throw lost;
      try {
        await mutationLeaseRequest({ action: "renew", resource, leaseOwner, fence, ttlMs: LEASE_TTL_MS });
      } catch (error) {
        lost = error instanceof Error ? error : new Error(String(error));
        throw lost;
      }
    });
    return renewal;
  };
  const heartbeat = setInterval(() => { void renew().catch(() => undefined); }, HEARTBEAT_MS);
  try {
    return await work({
      fence,
      assertCurrent: async () => {
        if (lost) throw lost;
        await renew();
      },
    });
  } finally {
    clearInterval(heartbeat);
    await renewal.catch(() => undefined);
    await mutationLeaseRequest({ action: "release", resource, leaseOwner, fence }).catch(() => undefined);
  }
}
