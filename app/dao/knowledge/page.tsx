import KnowledgeClaimWorkbench from "@/app/components/KnowledgeClaimWorkbench";

export default function KnowledgePage() {
  return <section className="screen knowledge-screen">
    <div className="hero da"><span className="eyebrow">道藏中的可用理解</span><h1>知識主張庫</h1><p>保留來源、判斷、邊界與版本；正式採用仍由你決定。</p></div>
    <KnowledgeClaimWorkbench />
  </section>;
}
