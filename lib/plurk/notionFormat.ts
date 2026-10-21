// 噗浪・蓋樓台在 DB-14 知識庫的序列化格式(2026-08-02 擁有者裁決:範本與草稿都存
// DB-14,不新增欄位,排程時間/樓層內容/發布狀態一併存在「內容」欄,結構化文字
// 即可)。
//
// 格式:用一個不太可能出現在噗浪貼文文字裡的分隔符,把「metadata(JSON 一行)」
// 「主噗」「各樓」接在一起存成一個字串。metadata 損毀(例如被人手動編輯壞掉)
// 時容錯退回空 meta,不擋讀取——比照專案既有的防禦性 fallback 慣例。
import { PLURK_TEMPLATE_TITLE_PREFIX, PLURK_DRAFT_TITLE_PREFIX } from "@/lib/notion/schema";
import type { PlurkDraftStatus } from "./logic";

const FLOOR_MARK = "\n<<<PLURK_FLOOR>>>\n";

export type PlurkContentMeta = {
  method: string;
  tplName?: string; // 草稿專用:記錄源自哪個範本,僅供參考顯示
  at?: string; // 草稿專用:排程時間(datetime-local 字串)
  status?: PlurkDraftStatus; // 草稿專用
  createdAt?: string; // 草稿專用:建立日期(YYYY-MM-DD),標題後綴用,建立後不變
  sourceVariantId?: string; // 聊解室平台稿來源；用於安全重送與更新同一草稿
  sourceVersionId?: string;
  sourceOperationId?: string; // 交接操作；遠端寫入後遺失回應時用來唯讀確認
};

export function encodePlurkContent(meta: PlurkContentMeta, main: string, floors: string[]): string {
  return [JSON.stringify(meta), main, ...floors].join(FLOOR_MARK);
}

export function decodePlurkContent(raw: string): { meta: PlurkContentMeta; main: string; floors: string[] } {
  const parts = (raw ?? "").split(FLOOR_MARK);
  let meta: PlurkContentMeta = { method: "" };
  try {
    meta = { method: "", ...JSON.parse(parts[0] ?? "{}") };
  } catch {
    meta = { method: "" };
  }
  const main = parts[1] ?? "";
  const floors = parts.slice(2);
  return { meta, main, floors };
}

export function plurkTemplateTitle(name: string): string {
  return PLURK_TEMPLATE_TITLE_PREFIX + name;
}
export function plurkTemplateNameFromTitle(title: string): string {
  return title.startsWith(PLURK_TEMPLATE_TITLE_PREFIX) ? title.slice(PLURK_TEMPLATE_TITLE_PREFIX.length) : title;
}
export function plurkDraftTitle(displayTitle: string, createdAt: string): string {
  return `${PLURK_DRAFT_TITLE_PREFIX}${displayTitle}-${createdAt}`;
}
