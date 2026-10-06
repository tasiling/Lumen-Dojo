import "server-only";

import { BridgeError, originalTimestamp, uuid } from "./externalResults/model";
import { Client } from "@notionhq/client";
import { withNotionRateLimit } from "@/lib/notion/client";
import {
  CONTEXT_PRACTICE_MODES,
  CONTEXT_ROOM_STATUSES,
  CONTEXT_TOPIC_LABELS,
  normalizeContextRoomDraft,
  type ContextPracticeMode,
  type ContextRoomResultDraft,
  type ContextRoomStatus,
  type ContextTopicLabel,
} from "./contextRoomResult";

const DEFAULT_SESSIONS_DATA_SOURCE_ID = "2408cbf8-c394-4d33-927b-df0f2bea0594";

type NotionProperty = Record<string, unknown>;
type NotionPage = {
  id: string;
  properties: Record<string, NotionProperty>;
};

export type ContextRoomInboxItem = {
  notionPageId: string;
  syncedAt: string;
  draft: ContextRoomResultDraft;
};

export type ContextRoomInboxState = {
  ready: boolean;
  usingDedicatedToken: boolean;
  items: ContextRoomInboxItem[];
  invalidCount: number;
  error: string | null;
};

function config() {
  const dedicatedToken = process.env.CONTEXT_ROOM_NOTION_TOKEN?.trim() ?? "";
  return {
    token: dedicatedToken || process.env.NOTION_TOKEN?.trim() || "",
    dataSourceId:
      process.env.CONTEXT_ROOM_NOTION_SESSIONS_DATA_SOURCE_ID?.trim() ||
      DEFAULT_SESSIONS_DATA_SOURCE_ID,
    usingDedicatedToken: Boolean(dedicatedToken),
  };
}

function plainText(property: NotionProperty | undefined): string {
  const values = Array.isArray(property?.rich_text)
    ? property.rich_text
    : Array.isArray(property?.title)
      ? property.title
      : [];
  return values
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const value = item as {
        plain_text?: unknown;
        text?: { content?: unknown };
      };
      return typeof value.plain_text === "string"
        ? value.plain_text
        : typeof value.text?.content === "string"
          ? value.text.content
          : "";
    })
    .join("")
    .trim();
}

function selectName(property: NotionProperty | undefined): string {
  const select = property?.select;
  if (!select || typeof select !== "object") return "";
  const name = (select as { name?: unknown }).name;
  return typeof name === "string" ? name.trim() : "";
}

function numberValue(property: NotionProperty | undefined): number | null {
  return typeof property?.number === "number" &&
    Number.isFinite(property.number)
    ? property.number
    : null;
}

function checkboxValue(property: NotionProperty | undefined): boolean {
  return property?.checkbox === true;
}

function dateStart(property: NotionProperty | undefined): string {
  const date = property?.date;
  if (!date || typeof date !== "object") return "";
  const start = (date as { start?: unknown }).start;
  return typeof start === "string" ? start.slice(0, 10) : "";
}

function normalizeMode(value: string): ContextPracticeMode | null {
  const map: Record<string, ContextPracticeMode> = {
    寫作: "writing",
    主題口說: "topic_speaking",
    情境對話: "dialogue",
    對話: "dialogue",
    快速重說: "quick_retell",
  };
  const mapped = map[value] ?? value;
  return CONTEXT_PRACTICE_MODES.includes(mapped as ContextPracticeMode)
    ? (mapped as ContextPracticeMode)
    : null;
}

function summaryText(draft: ContextRoomResultDraft): string {
  const position = draft.topicPosition ? ` ${draft.topicPosition} / 5` : "";
  const modeLabels: Record<ContextPracticeMode, string> = {
    writing: "寫作",
    topic_speaking: "主題口說",
    dialogue: "情境對話",
    quick_retell: "快速重說",
  };
  return [
    `sourceEventId：${draft.sourceEventId ?? ""}`,
    `素材：${draft.materialTitle}`,
    draft.batchLabel ? `內容批次：${draft.batchLabel}` : "",
    `完成：${draft.topicLabel ?? ""}${position}`,
    `模式：${draft.practiceMode ? modeLabels[draft.practiceMode] : ""}`,
    `First完成：${draft.firstCompleted ? "完成" : "未完成"}`,
    `Second Take：${draft.secondTakeCompleted ? "完成" : "未完成"}`,
    `留下表達：${draft.expressionCount} 個`,
    `狀態：${draft.contextRoomStatus ?? ""}`,
    draft.focus ? `本次卡點：${draft.focus}` : "",
    `日期：${draft.practicedOn}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function mapPage(page: NotionPage): ContextRoomInboxItem | null {
  const properties = page.properties;
  const topic = selectName(properties["話題類型"]);
  const status = selectName(properties["修習室狀態"]);
  const draft = normalizeContextRoomDraft({
    sourceEventId: plainText(properties.sourceEventId) || null,
    materialTitle: plainText(properties["素材名稱"]),
    batchLabel: plainText(properties["內容批次／章節"]),
    topicLabel: CONTEXT_TOPIC_LABELS.includes(topic as ContextTopicLabel)
      ? (topic as ContextTopicLabel)
      : null,
    topicPosition: numberValue(properties["話題位置"]),
    practiceMode: normalizeMode(selectName(properties["練習模式"])),
    firstCompleted: checkboxValue(properties["First完成"]),
    secondTakeCompleted: checkboxValue(properties["Second Take完成"]),
    expressionCount: numberValue(properties["留下表達數"]) ?? 0,
    contextRoomStatus: CONTEXT_ROOM_STATUSES.includes(
      status as ContextRoomStatus,
    )
      ? (status as ContextRoomStatus)
      : null,
    focus: plainText(properties["本次卡點"]),
    practicedOn: dateStart(properties["修習日期"]),
    rawSummary: "",
  });
  if (!draft.sourceEventId) return null;
  draft.rawSummary = summaryText(draft);
  return {
    notionPageId: page.id,
    syncedAt: dateStart(properties["同步日期"]),
    draft,
  };
}

export async function listContextRoomNotionInbox(): Promise<ContextRoomInboxState> {
  const current = config();
  if (!current.token || !current.dataSourceId) {
    return {
      ready: false,
      usingDedicatedToken: current.usingDedicatedToken,
      items: [],
      invalidCount: 0,
      error: "尚未設定語境修習室的 Notion 讀取權限。",
    };
  }

  try {
    const client = new Client({ auth: current.token });
    const response = await withNotionRateLimit(() =>
      client.dataSources.query({
        data_source_id: current.dataSourceId,
        page_size: 30,
        filter: {
          and: [
            { property: "syncVersion", number: { equals: 1 } },
            { property: "行光道場已接收", checkbox: { equals: false } },
          ],
        },
        sorts: [{ property: "修習日期", direction: "descending" }],
      }),
    );
    const pages = response.results.filter(
      (item): item is typeof item & NotionPage =>
        item.object === "page" && "properties" in item,
    );
    const mapped = pages.map(mapPage);
    return {
      ready: true,
      usingDedicatedToken: current.usingDedicatedToken,
      items: mapped.filter((item): item is ContextRoomInboxItem =>
        Boolean(item),
      ),
      invalidCount: mapped.filter((item) => !item).length,
      error: null,
    };
  } catch {
    return {
      ready: false,
      usingDedicatedToken: current.usingDedicatedToken,
      items: [],
      invalidCount: 0,
      error: "NOTION_TEMPORARILY_UNAVAILABLE",
    };
  }
}

export async function acknowledgeContextRoomNotionResult(params: {
  notionPageId: string;
  sourceEventId: string;
}): Promise<void> {
  const current = config();
  if (!current.token) throw new Error("缺少語境修習室的 Notion 讀取權限");
  const client = new Client({ auth: current.token });
  const page = await withNotionRateLimit(() =>
    client.pages.retrieve({ page_id: params.notionPageId }),
  );
  assertInboxParent(page, current.dataSourceId);
  if (!("properties" in page)) throw new Error("找不到語境修習成果頁面");
  const actualEventId = plainText(
    (page.properties as Record<string, NotionProperty>).sourceEventId,
  );
  if (!actualEventId || actualEventId !== params.sourceEventId) {
    throw new Error("語境修習成果識別碼不符，未更新 Notion 接收狀態");
  }
  await withNotionRateLimit(() =>
    client.pages.update({
      page_id: params.notionPageId,
      properties: {
        行光道場已接收: { checkbox: true },
        行光道場接收日期: { date: { start: new Date().toISOString() } },
      },
    }),
  );
}

// R2-5C: verify a caller-selected page against the fixed server data source.
// Only identity/schema/ack metadata is returned, never completion-card content.
function assertInboxParent(page: unknown, expected: string): void {
  const parent = (
    page as { parent?: { type?: string; data_source_id?: string } }
  ).parent;
  if (
    parent?.type !== "data_source_id" ||
    parent.data_source_id?.replaceAll("-", "") !== expected.replaceAll("-", "")
  )
    throw new BridgeError("NOTION_SOURCE_OWNER_MISMATCH", 403);
}
export async function readContextRoomNotionIdentity(pageId: string) {
  if (!uuid(pageId)) throw new BridgeError("NOTION_PAGE_INVALID", 400);
  const current = config();
  if (!current.token) throw new BridgeError("NOTION_NOT_CONNECTED", 503);
  const client = new Client({ auth: current.token, retry: false });
  let page;
  try {
    page = await withNotionRateLimit(() =>
      client.pages.retrieve({ page_id: pageId }),
    );
  } catch {
    throw new BridgeError("NOTION_TEMPORARILY_UNAVAILABLE", 503);
  }
  assertInboxParent(page, current.dataSourceId);
  if (!("properties" in page) || page.archived || page.in_trash)
    throw new BridgeError("NOTION_SOURCE_UNVERIFIED", 409);
  const props = page.properties as Record<string, NotionProperty>;
  const sourceEventId = plainText(props.sourceEventId);
  if (!uuid(sourceEventId) || numberValue(props.syncVersion) !== 1)
    throw new BridgeError("NOTION_SOURCE_UNVERIFIED", 409);
  return {
    notionPageId: page.id,
    sourceEventId,
    syncVersion: 1 as const,
    acknowledged: checkboxValue(props["行光道場已接收"]),
    acknowledgedAt: originalAckDate(props["行光道場接收日期"]),
  };
}

function originalAckDate(property: NotionProperty | undefined): string | null {
  const value = (property?.date as { start?: unknown } | undefined)?.start;
  if (typeof value !== "string" || !value) return null;
  if (/^\d{4}-\d\d-\d\d$/.test(value)) return value;
  return originalTimestamp(value);
}
