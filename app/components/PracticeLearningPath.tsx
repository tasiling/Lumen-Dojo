import type { LearningEntity } from "@/lib/dojo/learningFoundation/model";
import { STATUS_LABELS } from "@/lib/dojo/learningFoundation/model";
import { CURRICULUM } from "@/lib/dojo/learningFoundation/curriculum";
import Link from "./PracticeRouteLink";

function Topic({ topic, readingReturn, busy, onChangeStatus }: {
  topic: LearningEntity; readingReturn: string; busy: boolean; onChangeStatus: (topic: LearningEntity) => void;
}) {
  const reading = CURRICULUM.psychology.stages.flatMap(stage => stage.topics).find(unit => unit.name === topic.name)?.readingFocus;
  const record = new URLSearchParams({ new: "1", learningItem: topic.itemId ?? "", topicId: topic.id });
  if (topic.stageId) record.set("stageId", topic.stageId);
  return <details className="practice-topic-card">
    <summary><span><b role="heading" aria-level={3}>{topic.name}</b><small>{STATUS_LABELS[topic.status]}</small></span><span className="practice-disclosure-mark" aria-hidden="true">＋</span></summary>
    <div className="practice-topic-body">
      {topic.description && <p className="practice-path-prose">{topic.description}</p>}
      <dl className="practice-path-outcomes">{topic.goal && <div><dt>練習方向</dt><dd>{topic.goal}</dd></div>}<div><dt>留下的成果</dt><dd>{topic.expectedOutcome || "尚未指定"}</dd></div></dl>
      <div className="practice-shortcuts">
        {reading && <Link href={"/reading?" + new URLSearchParams({ focus: reading, returnTo: readingReturn })}>閱讀「焦慮與努力」</Link>}
        {topic.status !== "archived" && <Link href={"/practice/records?" + record}>記錄這個練習</Link>}
        {["active", "completed"].includes(topic.status) && <button type="button" disabled={busy} onClick={() => onChangeStatus(topic)}>{topic.status === "completed" ? "恢復修習" : "標記單元完成"}</button>}
      </div>
    </div>
  </details>;
}

export default function PracticeLearningPath({ stages, topics, ...actions }: {
  stages: LearningEntity[]; topics: LearningEntity[]; readingReturn: string; busy: boolean; onChangeStatus: (topic: LearningEntity) => void;
}) {
  const loose = topics.filter(t => !t.stageId || !stages.some(s => s.id === t.stageId));
  return <div className="practice-learning-path">
    <p className="practice-path-intro">依需要選擇階段，展開想練習的主題。不必逐關解鎖。</p>
    {!stages.length && !topics.length && <div className="practice-empty"><b>學習路徑還留著空間</b><p>尚無階段或主題，也可以先留下這次的修習紀錄。</p></div>}
    {stages.map((stage, index) => {
      const children = topics.filter(t => t.stageId === stage.id);
      return <details className="card practice-stage-card" key={stage.id}>
        <summary><span className="practice-stage-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span className="practice-stage-title"><b role="heading" aria-level={2}>{stage.name}</b><small>{children.length} 個主題 · {STATUS_LABELS[stage.status]}</small></span><span className="practice-disclosure-mark" aria-hidden="true">＋</span></summary>
        <div className="practice-stage-body">
          {stage.description && <p className="practice-path-prose">{stage.description}</p>}
          {(stage.goal || stage.expectedOutcome) && <dl className="practice-path-outcomes">{stage.goal && <div><dt>學習目標</dt><dd>{stage.goal}</dd></div>}{stage.expectedOutcome && <div><dt>預期成果</dt><dd>{stage.expectedOutcome}</dd></div>}</dl>}
          <div className="practice-topic-list">{children.map(topic => <Topic key={topic.id} topic={topic} {...actions} />)}</div>
        </div>
      </details>;
    })}
    {loose.length > 0 && <section className="card practice-loose-topics"><h2>尚未指定階段的主題</h2><div className="practice-topic-list">{loose.map(topic => <Topic key={topic.id} topic={topic} {...actions} />)}</div></section>}
  </div>;
}
