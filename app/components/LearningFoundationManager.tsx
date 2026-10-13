"use client";
import { useCallback, useEffect, useState } from "react";
import { useDojo } from "@/lib/dojo/store";
import { useRouter } from "next/navigation";
import type { CaptureEntry, LearningTrackKey } from "@/lib/dojo/formal";
import { LEARNING_TRACKS } from "@/lib/dojo/learning";
import {
  STATUS_LABELS,
  type EntityInput,
  type EntityKind,
  type FoundationSnapshot,
  type LearningEntity,
} from "@/lib/dojo/learningFoundation/model";

type Editor = {
  kind: EntityKind;
  entity: LearningEntity | null;
  input: EntityInput;
};
const sorted = (items: LearningEntity[]) =>
  [...items].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
async function api<T>(method = "GET", body?: unknown): Promise<T> {
  const response = await fetch("/api/dojo/learning/foundation", {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? `學習資料不可用（${response.status}）`);
  return data;
}
export default function LearningFoundationManager({
  materials,
  onLegacySelect,
}: {
  materials: CaptureEntry[];
  onLegacySelect: (key: LearningTrackKey | null, id?: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<FoundationSnapshot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { startTimerWith, openQuickAdd, entries } = useDojo();
  const router = useRouter();
  const load = useCallback(async () => {
    try {
      const next = await api<FoundationSnapshot>();
      setSnapshot(next);
      setSelected(
        (current) =>
          current ??
          new URLSearchParams(window.location.search).get("learningItem") ??
          next.entities.find(
            (e) => e.kind === "item" && e.legacyKey === "english",
          )?.id ??
          null,
      );
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const entities = snapshot?.entities ?? [];
  const items = sorted(entities.filter((e) => e.kind === "item"));
  const active = items.find((e) => e.id === selected) ?? null;
  const stages = sorted(
    entities.filter((e) => e.kind === "stage" && e.itemId === selected),
  );
  const topics = sorted(
    entities.filter((e) => e.kind === "topic" && e.itemId === selected),
  );
  useEffect(() => {
    if (active) onLegacySelect(active.legacyKey, active.id);
  }, [active, onLegacySelect]);
  function choose(item: LearningEntity) {
    setSelected(item.id);
    setEditor(null);
    setNotice("");
    const url = new URL(window.location.href);
    url.searchParams.set("learningItem", item.id);
    window.history.replaceState(window.history.state, "", url);
  }
  async function mutate(
    method: string,
    body: unknown,
    after?: (data: { entity?: LearningEntity }) => void,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{
        entity?: LearningEntity;
        conflicts?: string[];
      }>(method, body);
      setSnapshot(await api<FoundationSnapshot>());
      after?.(result);
      if (result.conflicts?.length) setError(result.conflicts.join("；"));
      else setNotice("已儲存");
    } catch (caught) {
      setError(
        `${caught instanceof Error ? caught.message : String(caught)}。請重新讀取確認已保存的部分，再重試。`,
      );
    } finally {
      setBusy(false);
    }
  }
  function edit(
    kind: EntityKind,
    entity: LearningEntity | null = null,
    stageId: string | null = null,
  ) {
    setEditor({
      kind,
      entity,
      input: entity
        ? {
            name: entity.name,
            description: entity.description,
            vision: entity.vision,
            goal: entity.goal,
            expectedOutcome: entity.expectedOutcome,
            order: entity.order,
            status: entity.status,
            ...(kind === "item" ? { focused: entity.focused } : {}),
            ...(kind === "topic" ? { stageId: entity.stageId } : {}),
          }
        : {
            name: "",
            description: "",
            vision: "",
            goal: "",
            expectedOutcome: "",
            status: "active",
            ...(kind === "topic" ? { stageId } : {}),
          },
    });
  }
  const patch = (entity: LearningEntity, input: EntityInput) =>
    void mutate("PATCH", { id: entity.id, revision: entity.revision, input });
  function actions(entity: LearningEntity) {
    return (
      <div className="foundation-actions">
        <button disabled={busy} onClick={() => edit(entity.kind, entity)}>
          編輯
          {entity.kind === "item"
            ? "項目"
            : entity.kind === "stage"
              ? "階段"
              : "主題"}
        </button>
        <button
          disabled={busy}
          onClick={() =>
            patch(entity, {
              status: entity.status === "active" ? "paused" : "active",
            })
          }
        >
          {entity.status === "active" ? "暫停" : "恢復"}
        </button>
        {entity.status !== "archived" && (
          <button
            disabled={busy}
            onClick={() => patch(entity, { status: "archived" })}
          >
            封存
          </button>
        )}
        {entity.kind === "item" && (
          <button
            disabled={busy}
            aria-pressed={entity.focused}
            onClick={() => patch(entity, { focused: !entity.focused })}
          >
            {entity.focused ? "取消本期專注" : "本期專注"}
          </button>
        )}
      </div>
    );
  }
  const related = active
    ? materials.filter(
        (m) =>
          m.learningItemIds?.includes(active.id) ||
          (active.legacyKey && m.learningTracks.includes(active.legacyKey)),
      )
    : [];
  const recent = active
    ? entries
        .filter(
          (e) =>
            e.learningItemId === active.id ||
            (active.legacyKey &&
              e.kind === `學習／${LEARNING_TRACKS[active.legacyKey].title}`),
        )
        .slice(0, 3)
    : [];
  function row(entity: LearningEntity) {
    return (
      <article className="foundation-node" key={entity.id}>
        <h4>{entity.name}</h4>
        <small>
          {STATUS_LABELS[entity.status]} · 排序 {entity.order}
        </small>
        {entity.description && <p>{entity.description}</p>}
        <p>學習目標：{entity.goal || "尚未指定"}</p>
        <p>預期成果：{entity.expectedOutcome || "尚未指定"}</p>
        {actions(entity)}
      </article>
    );
  }
  return (
    <section className="learning-foundation" aria-label="跨學科學習管理">
      <div className="subsection-title">
        <h3>我的學習項目</h3>
        <button disabled={busy || !snapshot} onClick={() => edit("item")}>
          ＋ 新增項目
        </button>
      </div>
      <p className="muted-note">
        可以同時專注多個項目，隨時暫停或恢復。階段與主題皆可留空，不需逐關解鎖。
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <button
        disabled={busy}
        onClick={() => {
          setEditor(null);
          void load();
        }}
      >
        重新讀取學習資料
      </button>
      {!snapshot && !error && <p>正在讀取學習項目…</p>}
      {!!snapshot?.missing.length && (
        <div className="foundation-init">
          <button disabled={busy} onClick={() => setPreview(!preview)}>
            預覽缺項初始化（{snapshot.missing.length} 項）
          </button>
          {preview && (
            <>
              <p>
                將新增以下項目與已確認願景；保留既有五項與所有來源。不建立階段、教材、程度或完成紀錄。可先編輯或新增自己的項目。
              </p>
              <ul>
                {snapshot.missing.map((seed) => (
                  <li key={seed.key}>
                    <b>{seed.name}</b>：{seed.vision}
                  </li>
                ))}
              </ul>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void mutate("POST", { action: "initialize" }, () =>
                    setPreview(false),
                  )
                }
              >
                確認初始化缺項
              </button>
            </>
          )}
        </div>
      )}
      <div className="learning-track-grid">
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={selected === item.id}
            className={selected === item.id ? "on" : ""}
            onClick={() => choose(item)}
          >
            <b>{item.name}</b>
            <small>
              {STATUS_LABELS[item.status]}
              {item.focused ? " · 本期專注" : ""}
            </small>
          </button>
        ))}
      </div>
      {snapshot && items.length === 0 && (
        <>
          <p>尚未初始化跨學科項目；既有學習紀錄仍保留。</p>
          <div className="learning-chip-row">
            {Object.entries(LEARNING_TRACKS).map(([key, config]) => (
              <button
                key={key}
                onClick={() => onLegacySelect(key as LearningTrackKey)}
              >
                {config.title}
              </button>
            ))}
          </div>
        </>
      )}
      {active && (
        <div className="foundation-detail">
          <h3>{active.name}</h3>
          <p>{active.description || "尚未填寫說明"}</p>
          <p>長期願景：{active.vision || "尚未指定"}</p>
          <small>
            {STATUS_LABELS[active.status]} · 排序 {active.order}
          </small>
          {actions(active)}
          <div className="foundation-actions">
            <button
              disabled={busy || active.status === "archived"}
              onClick={() => edit("stage")}
            >
              ＋ 新增階段
            </button>
            <button
              disabled={busy || active.status === "archived"}
              onClick={() => edit("topic")}
            >
              ＋ 新增主題
            </button>
          </div>
          {stages.length === 0 && (
            <p className="muted-note">
              目前沒有階段，可以直接新增主題或開始探索。
            </p>
          )}
          {stages.map((stage) => (
            <div className="foundation-stage" key={stage.id}>
              {row(stage)}
              <div className="foundation-topics">
                {topics.filter((t) => t.stageId === stage.id).map(row)}
              </div>
            </div>
          ))}
          <h4>尚未指定階段的主題</h4>
          {topics.filter((t) => !t.stageId).map(row)}
          {topics.length === 0 && (
            <p className="muted-note">尚未指定主題；空白路徑也可以使用。</p>
          )}
          <div className="foundation-actions">
            <button
              className="primary"
              onClick={() => {
                startTimerWith({
                  space: "practice",
                  title: `${active.name}・一段修習`,
                  kind: `學習／${active.name}`,
                  learningItemId: active.id,
                });
                router.push("/timer");
              }}
            >
              開始這次修習
            </button>
            <button
              onClick={() =>
                openQuickAdd({
                  presetSpace: "practice",
                  presetKind: `學習／${active.name}`,
                  learningItemId: active.id,
                })
              }
            >
              留下修習紀錄
            </button>
          </div>
          <h4>關聯素材（{related.length}）</h4>
          {related.map((m) => (
            <p key={m.id}>{m.title}</p>
          ))}
          {related.length === 0 && (
            <p className="muted-note">可在野採連到此學習項目。</p>
          )}
          {recent.length > 0 && (
            <>
              <h4>最近修習</h4>
              {recent.map((e) => (
                <p key={e.id}>
                  {e.date} · {e.title}
                </p>
              ))}
            </>
          )}
        </div>
      )}
      {editor && (
        <form
          className="foundation-editor"
          onSubmit={(event) => {
            event.preventDefault();
            const current = editor;
            void mutate(
              current.entity ? "PATCH" : "POST",
              current.entity
                ? {
                    id: current.entity.id,
                    revision: current.entity.revision,
                    input: current.input,
                  }
                : {
                    action: "create",
                    kind: current.kind,
                    itemId: active?.id ?? null,
                    input: current.input,
                  },
              (result) => {
                setEditor(null);
                if (result.entity?.kind === "item") choose(result.entity);
              },
            );
          }}
        >
          <h4>
            {editor.entity ? "編輯" : "新增"}
            {editor.kind === "item"
              ? "項目"
              : editor.kind === "stage"
                ? "階段"
                : "主題"}
          </h4>
          {(
            [
              "name",
              "description",
              ...(editor.kind === "item"
                ? ["vision"]
                : ["goal", "expectedOutcome"]),
            ] as Array<
              "name" | "description" | "vision" | "goal" | "expectedOutcome"
            >
          ).map((key) => (
            <label key={key}>
              {
                {
                  name: "名稱",
                  description: "說明",
                  vision: "長期願景",
                  goal: "學習目標",
                  expectedOutcome: "預期成果（學習目標文字）",
                }[key]
              }
              {key === "name" ? (
                <input
                  className="field"
                  required
                  maxLength={300}
                  value={String(editor.input[key] ?? "")}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      input: { ...editor.input, [key]: event.target.value },
                    })
                  }
                />
              ) : (
                <textarea
                  className="field"
                  maxLength={2000}
                  value={String(editor.input[key] ?? "")}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      input: { ...editor.input, [key]: event.target.value },
                    })
                  }
                />
              )}
            </label>
          ))}
          <label>
            排序（由小到大）
            <input
              className="field"
              type="number"
              min={-100000}
              max={100000}
              step={1}
              value={editor.input.order ?? ""}
              onChange={(event) =>
                setEditor({
                  ...editor,
                  input: {
                    ...editor.input,
                    order:
                      event.target.value === ""
                        ? undefined
                        : Number(event.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            狀態
            <select
              className="field"
              value={editor.input.status ?? "active"}
              onChange={(event) =>
                setEditor({
                  ...editor,
                  input: {
                    ...editor.input,
                    status: event.target.value as LearningEntity["status"],
                  },
                })
              }
            >
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {editor.kind === "topic" && (
            <label>
              移動至同一項目內的階段
              <select
                className="field"
                value={editor.input.stageId ?? ""}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    input: {
                      ...editor.input,
                      stageId: event.target.value || null,
                    },
                  })
                }
              >
                <option value="">尚未指定階段</option>
                {stages
                  .filter(
                    (s) =>
                      s.status !== "archived" || s.id === editor.input.stageId,
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="foundation-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditor(null)}
            >
              取消
            </button>
            <button className="primary" disabled={busy} type="submit">
              {busy ? "儲存中…" : "儲存"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
