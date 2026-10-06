import {
  BridgeError,
  CONTRACT,
  compareTime,
  timestamp,
  validateResult,
  type SourceResult,
} from "./model";
export type Page = {
  contractVersion: string;
  results: SourceResult[];
  nextCursor: string | null;
  windowUpper: string;
  incrementalSemantics: string;
};
export type Adapter = {
  configured: boolean;
  page(after: string, cursor: string | null): Promise<Page>;
};
export function contextAdapter(
  config: { origin: string; secret: string; fetch?: typeof fetch } | null,
): Adapter {
  return {
    configured: !!config,
    async page(after, cursor) {
      if (!config) throw new BridgeError("SOURCE_NOT_CONNECTED", 503);
      const url = new URL(
        "/api/integrations/lumen/practice-results",
        config.origin,
      );
      url.searchParams.set("limit", "50");
      url.searchParams.set("after", after);
      if (cursor) url.searchParams.set("cursor", cursor);
      try {
        const response = await (config.fetch ?? fetch)(url, {
          headers: { Authorization: `Bearer ${config.secret}` },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok)
          throw new BridgeError(
            response.status === 401
              ? "SOURCE_AUTHORIZATION_FAILED"
              : "SOURCE_TEMPORARILY_UNAVAILABLE",
            503,
          );
        const reader = response.body?.getReader();
        if (!reader) throw new BridgeError("SOURCE_INVALID", 422);
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 512000) {
            await reader.cancel();
            throw new BridgeError("SOURCE_RESPONSE_TOO_LARGE", 422);
          }
          chunks.push(part.value);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (
          body.contractVersion !== CONTRACT ||
          !Array.isArray(body.results) ||
          body.results.length > 50 ||
          body.incrementalSemantics !==
            "bounded-live-window; inclusive overlapping refresh required"
        )
          throw new BridgeError("SOURCE_CONTRACT_INVALID", 422);
        const upper = timestamp(body.windowUpper),
          results = body.results.map((r: unknown) =>
            validateResult(r, config.origin),
          );
        let lastTime: string | null = null,
          lastId = "";
        for (const r of results) {
          if (
            compareTime(r.updatedAt, after) < 0 ||
            compareTime(r.updatedAt, upper) > 0 ||
            (lastTime &&
              (compareTime(r.updatedAt, lastTime) < 0 ||
                (compareTime(r.updatedAt, lastTime) === 0 &&
                  r.sourceId <= lastId)))
          )
            throw new BridgeError("SOURCE_PAGE_ORDER_INVALID", 422);
          lastTime = r.updatedAt;
          lastId = r.sourceId;
        }
        function decode(raw: unknown) {
          if (
            typeof raw !== "string" ||
            raw.length > 2048 ||
            !/^[A-Za-z0-9_-]+$/.test(raw)
          )
            throw new BridgeError("SOURCE_CURSOR_INVALID", 422);
          const c = JSON.parse(Buffer.from(raw, "base64url").toString());
          if (
            c.v !== 1 ||
            c.after !== after ||
            compareTime(c.upper, upper) !== 0
          )
            throw new BridgeError("SOURCE_CURSOR_INVALID", 422);
          timestamp(c.time);
          return c;
        }
        if (cursor) {
          const c = decode(cursor);
          for (const r of results)
            if (
              compareTime(r.updatedAt, c.time) < 0 ||
              (compareTime(r.updatedAt, c.time) === 0 && r.sourceId <= c.id)
            )
              throw new BridgeError("SOURCE_CURSOR_INVALID", 422);
        }
        if (body.nextCursor !== null) {
          const c = decode(body.nextCursor);
          if (
            !results.length ||
            c.time !== lastTime ||
            c.id !== lastId ||
            body.nextCursor === cursor
          )
            throw new BridgeError("SOURCE_CURSOR_INVALID", 422);
        }
        return {
          contractVersion: CONTRACT,
          results,
          nextCursor: body.nextCursor,
          windowUpper: upper,
          incrementalSemantics: body.incrementalSemantics,
        };
      } catch (e) {
        if (e instanceof BridgeError) throw e;
        throw new BridgeError("SOURCE_TEMPORARILY_UNAVAILABLE", 503);
      }
    },
  };
}
