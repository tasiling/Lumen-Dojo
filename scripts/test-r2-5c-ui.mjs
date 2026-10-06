import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { isolatedServer } from "./isolated-practice-server.mjs";
const server = await isolatedServer(3025, "r2-5c-ui-isolated"),
  output = process.env.R2_UI_OUTPUT_DIR ?? "/tmp/r2-5c-ui";
await mkdir(output, { recursive: true });
let browser;
let mutations = 0,
  connected = false,
  offline = false;
let receipts = [];
const id = "00000000-0000-4000-8000-000000000001";
const fixture = {
  schema: "external-source-receipt/v1",
  id: "a".repeat(64),
  owner: "fixture-owner",
  eventId: null,
  acceptance: "needs_review",
  reasons: ["R2_3_EXTERNAL_CONTRACT_PENDING", "SOURCE_TIMEZONE_UNKNOWN"],
  source: {
    sourceId: id,
    sourceRevision: "opaque:legacy-long-".repeat(15),
    activityMode: "quick_retell",
    completionStatus: "completed",
    sourceAvailability: "available",
    practicedOn: "2026-09-20",
    occurredAt: "2026-09-20T23:59:59.123456Z",
    timeZone: null,
    originalContext: null,
    currentContext: {
      projectName: "非常長的來源中文名稱".repeat(25),
      unitName:
        "A long English context without a guaranteed historic snapshot ".repeat(
          20,
        ),
    },
    summary: {
      mode: "quick_retell",
      firstDone: true,
      feedbackReceived: true,
      secondDone: false,
    },
    sourceLocation: `https://lumen-context-room-production-4a2c.up.railway.app/practice-results/${id}`,
    updatedAt: "2026-10-06T01:00:00.000001Z",
  },
  aliases: [],
  legacyReceipts: [],
  projections: {
    record: "blocked",
    lightStep: "blocked",
    weekly: "unlinked",
    ack: "not_applicable",
  },
};
try {
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addCookies([
    { name: "dsc_access_key", value: "r2-5c-ui-isolated", url: server.base },
  ]);
  await context.route("**/*", async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    if (u.origin !== server.base) return route.abort();
    if (u.pathname === "/__r25c-font" && process.env.UI_CJK_FONT)
      return route.fulfill({
        contentType: "font/otf",
        body: readFileSync(process.env.UI_CJK_FONT),
      });
    if (!u.pathname.startsWith("/api/")) return route.continue();
    let body = {},
      status = 200;
    if (u.pathname === "/api/dojo/learning/foundation")
      body = { entities: [], missing: [] };
    else if (u.pathname === "/api/dojo/learning/records")
      body = { records: [], cursor: null };
    else if (u.pathname === "/api/dojo/practice-events")
      body = { events: [], cursor: null };
    else if (u.pathname === "/api/dojo/external-results") {
      if (req.method() === "POST") {
        mutations++;
        const b = req.postDataJSON();
        assert.deepEqual(
          Object.keys(b).sort(),
          b.action === "retry" ? ["action", "id"] : ["action"],
        );
        if (offline) {
          status = 503;
          body = { code: "SOURCE_TEMPORARILY_UNAVAILABLE" };
        } else if (b.action === "retry")
          body = { outcome: "CONTRACT_PENDING_NO_PROJECTION" };
        else {
          receipts = [fixture];
          body = { remaining: false, counted: 0 };
        }
      } else
        body = {
          receipts,
          cursor: null,
          contractStatus: "pending",
          sources: {
            contextRoom: connected ? "configured" : "not_connected",
            vocabForge: "not_connected",
          },
          checkpoint: receipts.length
            ? {
                connection: offline ? "temporarily_unavailable" : "ready",
                lastSuccessAt: "2026-10-06T02:00:00.000001Z",
                cursor: null,
              }
            : null,
        };
    } else {
      status = 503;
      body = { error: "ISOLATED_ROUTE_UNAVAILABLE" };
    }
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  if (process.env.UI_CJK_FONT)
    await context.addInitScript(() => {
      window.__r25cFontReady = new FontFace("R25C CJK", "url(/__r25c-font)")
        .load()
        .then((f) => {
          document.fonts.add(f);
          return true;
        })
        .catch(() => false);
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          "body,body *{font-family:'R25C CJK',Arial,sans-serif!important}";
        document.head.append(style);
      });
    });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [375, 390, 430]) {
    connected = false;
    receipts = [];
    offline = false;
    await page.setViewportSize({ width, height: 844 });
    const before = mutations;
    await page.goto(`${server.base}/practice/records`);
    const panel = page.getByRole("region", { name: "外部修習來源" });
    await panel.getByText(/VF：尚未接入/).waitFor();
    assert.equal(mutations, before);
    assert.equal(
      await panel.getByRole("button", { name: "刷新來源成果" }).isDisabled(),
      true,
    );
    await panel.getByText("尚無來源快取；這不表示沒有完成過修習。").waitFor();
    connected = true;
    await page.reload();
    await panel.getByRole("button", { name: "刷新來源成果" }).click();
    await panel.getByRole("status").waitFor();
    await panel.getByText(/原日期可能是匯入日/).waitFor();
    await panel.getByText(/未知（沒有歷史快照）/).waitFor();
    await panel.getByText(/快速重說不強制 Second Take/).waitFor();
    assert.equal(await panel.locator("article").count(), 1);
    const link = panel.getByRole("link", { name: /返回來源工作台/ });
    assert.equal(
      await link.getAttribute("href"),
      fixture.source.sourceLocation,
    );
    assert.equal(await link.getAttribute("target"), "_blank");
    const count = mutations;
    await page.reload();
    await panel.getByText(/快速重說不強制 Second Take/).waitFor();
    assert.equal(mutations, count);
    await panel.getByRole("button", { name: "核對已保存來源" }).click();
    await panel.getByRole("status").filter({ hasText: "未建立事件" }).waitFor();
    assert.equal(receipts.length, 1);
    await page.setViewportSize({ width, height: 430 });
    await panel
      .getByRole("button", { name: "完整來源對帳" })
      .scrollIntoViewIfNeeded();
    await panel.getByRole("button", { name: "完整來源對帳" }).click();
    await panel.getByRole("status").waitFor();
    offline = true;
    await panel
      .getByRole("button", { name: "刷新來源成果" })
      .scrollIntoViewIfNeeded();
    await panel.getByRole("button", { name: "刷新來源成果" }).click();
    await panel.getByRole("alert").filter({ hasText: "不視為刪除" }).waitFor();
    assert.equal(await panel.locator("article").count(), 1);
    await page.setViewportSize({ width, height: 844 });
    const fontReady = await page.evaluate(() => window.__r25cFontReady);
    if (process.env.UI_CJK_FONT) assert.equal(fontReady, true);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert.ok(
      await panel.evaluate((e) => getComputedStyle(e).paddingBottom !== "0px"),
    );
    await page.screenshot({
      path: `${output}/external-${width}.png`,
      fullPage: true,
    });
    await page.goto(`${server.base}/practice`);
    await page.goBack();
    await panel.getByText(/快速重說不強制 Second Take/).waitFor();
    assert.equal(mutations, count + 3);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS R2-5C isolated Chromium UI 375/390/430: cache-only load/reload/back, not connected/no fake zero, explicit sync/reconcile/retry, legacy date/context limits, long Chinese/English without overflow, safe-area padding/reduced viewport, offline preserves source/local UI. Mock transport; not live integration/iPhone Safari.",
  );
} finally {
  await browser?.close();
  server.stop();
}
