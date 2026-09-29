import { Client } from "@notionhq/client";

// 單例 Notion client。token 由環境變數注入,不寫死在程式碼(委派書二、技術原則)。
function getToken(): string {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error(
      "缺少環境變數 NOTION_TOKEN。請於部署平台或 .env.local 設定 Notion Internal Integration Token。"
    );
  }
  return token;
}

let client: Client | null = null;
let noRetryClient: Client | null = null;
export function notionWithoutRetries(): Client {
  if (!noRetryClient) noRetryClient = new Client({ auth: getToken(), retry: false });
  return noRetryClient;
}
export function notion(): Client {
  if (!client) {
    client = new Client({ auth: getToken() });
  }
  return client;
}

// --- 節流佇列(六、Notion API 限制的處理要求)---
// Notion 速率限制約 3 請求/秒,批次操作排隊 + 節流,不得硬打。
const MIN_INTERVAL_MS = 350; // 略低於 3 req/s 上限,留安全邊際
let queue: Promise<unknown> = Promise.resolve();
let lastRunAt = 0;

async function throttledSlot(): Promise<void> {
  const run = queue.then(async () => {
    const wait = Math.max(0, lastRunAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastRunAt = Date.now();
  });
  queue = run.catch(() => {});
  return run;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 指數退避重試:最多 3 次,3 次仍失敗則丟出錯誤讓呼叫端記錄「哪幾筆沒寫入」。
// 429/5xx(Notion 端限流或暫時性錯誤)重試;無 status 的錯誤(網路中斷、連線
// 逾時等)本質上也是暫時性的,同樣視為可重試——只有 Notion 明確回傳的 4xx
// (參數錯誤、權限不足等)才是重試也不會成功的錯誤,才不重試。批次寫入
// (如日上三更批次建立)一次要連續送出數十筆請求,若中途有一兩筆因短暫網路
// 抖動失敗又沒被重試,會造成「這批只成功一半」的部分寫入,卻只看得到
// Notion 裡缺了幾筆、看不出原因——擴大重試範圍是為了降低這種情況發生的機率。
export async function withNotionRateLimit<T>(fn: () => Promise<T>, options: { retry?: boolean } = {}): Promise<T> {
  await throttledSlot();
  const delays = [500, 1500, 4000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const retryable = status === undefined || status === 429 || status >= 500;
      if (options.retry === false || !retryable || attempt === delays.length) break;
      await sleep(delays[attempt]);
    }
  }
  throw lastErr;
}

export type BatchResult<T> = {
  succeeded: T[];
  failed: { input: unknown; error: string }[];
};

// 批次執行:節流 + 重試,部分成功時回報成功/失敗清單,不靜默吞掉(六之三)。
export async function runBatch<In, Out>(
  inputs: In[],
  fn: (input: In) => Promise<Out>
): Promise<BatchResult<Out>> {
  const succeeded: Out[] = [];
  const failed: { input: unknown; error: string }[] = [];
  for (const input of inputs) {
    try {
      const result = await withNotionRateLimit(() => fn(input));
      succeeded.push(result);
    } catch (err) {
      failed.push({ input, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { succeeded, failed };
}
