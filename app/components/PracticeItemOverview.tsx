import type { LearningEntity } from "@/lib/dojo/learningFoundation/model";
import type { LearningTrackRecord } from "@/lib/dojo/learning";

// Render stored prose as text. Only explicit HTTP(S) sources become links.
function SourceText({ text }: { text: string }) {
  return <div className="practice-source-text">{text.split(/(https?:\/\/[^\s<>]+)/g).map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
      : part,
  )}</div>;
}

export default function PracticeItemOverview({ item, legacy }: {
  item: LearningEntity;
  legacy?: LearningTrackRecord;
}) {
  const long = item.description.length > 220;
  return <div className="practice-item-overview">
    <div className="practice-direction-grid">
      {[["長期方向", item.vision], ["學習目標", item.goal], ["預期成果", item.expectedOutcome]].map(([label, value]) =>
        <article className="card" key={label}><h2>{label}</h2><p>{value || "尚未指定，可在管理學習項目中補充。"}</p></article>,
      )}
    </div>
    {legacy && <article className="card"><h2>目前專注</h2><dl>
      <dt>目前階段</dt><dd>{legacy.currentStage || "尚未指定"}</dd>
      <dt>目前專注</dt><dd>{legacy.currentFocus || "尚未指定"}</dd>
      <dt>下一步</dt><dd>{legacy.nextAction || "尚未指定"}</dd>
    </dl></article>}
    <details className={`card practice-item-description${long ? " long-description" : ""}`} open={!long}>
      <summary>項目說明與來源<span aria-hidden="true">＋</span></summary>
      <SourceText text={item.description || "尚未填寫說明。"} />
    </details>
  </div>;
}
