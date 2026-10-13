"use client";
import dynamic from "next/dynamic";
import Link from "./PracticeRouteLink";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useDojo } from "@/lib/dojo/store";
import { GUANGXING, GUANGFA } from "@/lib/dojo/constants";
import type { CaptureEntry } from "@/lib/dojo/formal";
import PracticeLearning from "./PracticeLearning";
const Records = dynamic(() => import("./LearningRecordWorkspace"));
const Journal = dynamic(() => import("./EnglishJournalWorkbench"));
const Manager = dynamic(() => import("./LearningFoundationManager"));
const Legacy = dynamic(() => import("./LearningPaths"));
const Roles = dynamic(() => import("./CreativeRoleStudio"));
const Vision = dynamic(() => import("./VisionPractice"));
const Context = dynamic(() => import("./EnglishContextRoomBridge"));
const Grammar = dynamic(() => import("./EnglishContextSeedInbox"));
const Topic = dynamic(() => import("./EnglishTopicStudy"));
const Rhythm = dynamic(() => import("./EnglishRhythmWeek"));
const names: Record<string, string> = {
  records: "學習歷程",
  journal: "日記自譯",
  manage: "學習管理",
  legacy: "既有五項學習設定",
  body: "身・身體照料",
  emotion: "心・情",
  intention: "心・意",
  spirit: "靈・Vision",
  context: "語境修習室",
  grammar: "句型與語法",
  topic: "英文主題練習",
  rhythm: "英文節奏",
  vocabulary: "VocabForge",
  logs: "修習紀錄",
  atlas: "光之圖鑑",
};
export default function PracticeWorkspace({
  workspace,
  vocabularyUrl,
}: {
  workspace: string;
  vocabularyUrl?: string;
}) {
  const params = useSearchParams();
  const { entries, entriesLoading, entriesError, openQuickAdd } = useDojo();
  const [materials, setMaterials] = useState<CaptureEntry[]>([]);
  const [error, setError] = useState("");
  const noop = useCallback(() => {}, []);
  useEffect(() => {
    if (workspace !== "manage") return;
    let live = true;
    fetch("/api/dojo/captures", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Error(j.error ?? "素材不可用");
        if (live) setMaterials(j.captures);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [workspace]);
  const returnTo = params.get("returnTo");
  const parent = returnTo?.startsWith("/practice/learning?")
    ? returnTo
    : (workspace === "manage" || workspace === "records")
      ? `/practice/learning${params.get("learningItem") ? `?learningItem=${params.get("learningItem")}` : ""}`
      : "/practice";
  const kind =
    workspace === "body" ? "身" : workspace === "emotion" ? "心／情" : "靈";
  return (
    <section className="screen practice-workspace">
      <Link href={parent}>
        ‹ 返回{parent === "/practice" ? "修習所" : "學科工作空間"}
      </Link>
      {workspace !== "learning" && <h1>{names[workspace]}</h1>}
      {workspace === "learning" && <PracticeLearning />}
      {workspace === "records" && <Records />}
      {workspace === "manage" && (
        <>
          {error && <p role="alert">{error}</p>}
          <Manager
            materials={materials}
            onLegacySelect={noop}
            defaultEnglish={false}
          />
          <Link href="/practice/legacy">既有五項設定與歷史活動</Link>
        </>
      )}
      {workspace === "legacy" && <Legacy settingsOnly />}
      {workspace === "journal" && (
        <Journal initialDate={params.get("journal")} />
      )}
      {(workspace === "body" || workspace === "emotion") && (
        <>
          <p>
            {workspace === "body"
              ? "活動、睡眠、飲食、疼痛與恢復。留下單次紀錄，不提供伸展處方。"
              : "情緒覺察、感恩與心裡小語。"}
          </p>
          <button
            className="primary"
            onClick={() =>
              openQuickAdd({ presetSpace: "practice", presetKind: kind })
            }
          >
            留下{kind}的紀錄
          </button>
          <Link href="/timer">輔助計時（選用）</Link>
        </>
      )}
      {workspace === "intention" && (
        <>
          <nav className="practice-tabs">
            <a href="#creative-role">創現角色</a>
            <a href="#creative-milestone">里程碑</a>
            <a href="#creative-affirm">狂A肯定句</a>
          </nav>
          <p>狂A用於角色與行動；晨間肯定句保留於每日流程。</p>
          <Roles />
        </>
      )}
      {workspace === "spirit" && (
        <>
          <Vision />
          <button
            onClick={() =>
              openQuickAdd({ presetSpace: "practice", presetKind: "靈" })
            }
          >
            留下靈修紀錄
          </button>
          <Link href="/timer">輔助計時（選用）</Link>
        </>
      )}
      {workspace === "context" && <Context />}
      {workspace === "grammar" && <Grammar />}
      {workspace === "topic" && <Topic />}
      {workspace === "rhythm" && <Rhythm />}
      {workspace === "vocabulary" && (
        <>
          {vocabularyUrl ? (
            <a href={vocabularyUrl} target="_blank" rel="noreferrer">
              開啟 VocabForge
            </a>
          ) : (
            <p role="status">VocabForge 外部入口尚未配置；目前無法直接開啟。</p>
          )}
          <Link href="/practice/journal">日記候選詞與既有派送紀錄</Link>
        </>
      )}
      {workspace === "logs" && (
        <>
          {entriesLoading && <p>讀取修習紀錄中…</p>}
          {entriesError && <p role="alert">{entriesError}</p>}
          {entries
            .filter((e) => e.space === "practice")
            .map((e) => (
              <button
                className="card practice-link"
                key={e.id}
                onClick={() => openQuickAdd({ editId: e.id })}
              >
                <b>{e.title}</b>
                <small>
                  {e.kind} · {e.date}
                </small>
              </button>
            ))}
          {!entriesLoading && !entriesError && !entries.some((e) => e.space === "practice") && (
            <p>尚無修習紀錄。</p>
          )}
          <Link href="/history">歷史紀錄與計時</Link>
        </>
      )}
      {workspace === "atlas" && (
        <>
          {[
            ["光行・每日修行的運作方式", GUANGXING],
            ["光法・光行成熟後的應用", GUANGFA],
          ].map(([title, values]) => (
            <section key={String(title)}>
              <h2>{String(title)}</h2>
              {Object.values(values).map((v) => (
                <article className="card" key={v[0]}>
                  <h3>{v[0]}</h3>
                  <p>{v[1]}</p>
                  <small>{v[2]}</small>
                  <button
                    onClick={() =>
                      openQuickAdd({
                        presetSpace: "practice",
                        presetKind: String(title).startsWith("光行")
                          ? `光行／${v[0]}`
                          : `光法／${v[0]}`,
                      })
                    }
                  >
                    留下紀錄
                  </button>
                </article>
              ))}
            </section>
          ))}
          <p>光行與光法可各自選填，不計分、不解鎖。</p>
        </>
      )}
    </section>
  );
}
