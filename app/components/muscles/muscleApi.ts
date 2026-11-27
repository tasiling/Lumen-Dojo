import type { MuscleSnapshot } from "@/lib/dojo/muscleCards/service";
import type { CardRef } from "@/lib/dojo/daoLinks/model";
import { MUSCLE_KIND, PATTERN_KIND } from "@/lib/dojo/muscleCards/network";
import { pathForMuscle } from "@/lib/dojo/muscleCards/catalog";

export type { MuscleSnapshot };

export async function muscleFetch<T>(url: string, init?: { method: string; body: unknown }): Promise<T> {
  const response = await fetch(url, init
    ? { method: init.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) }
    : { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || "暫時無法讀取或保存，請稍後再試。");
  return data as T;
}
export const readSnapshot = () => muscleFetch<MuscleSnapshot>("/api/dojo/muscles");

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 修習所裡一張卡的網址。肌肉卡跨路徑時，路徑跟著切換到它的部位。 */
export function practiceCardHref(ref: CardRef, base: URLSearchParams | null): string {
  const q = new URLSearchParams(base?.toString() ?? "");
  if (!q.get("learningItem")) q.set("learningItem", "massage");
  q.set("tab", "path");
  if (ref.kind === MUSCLE_KIND) {
    q.set("path", pathForMuscle(ref.id, q.get("path")) ?? "head");
    q.set("muscle", ref.id);
    q.delete("pattern");
  } else if (ref.kind === PATTERN_KIND) {
    q.set("pattern", ref.id);
    q.delete("muscle");
  }
  return `/practice/learning?${q}`;
}
