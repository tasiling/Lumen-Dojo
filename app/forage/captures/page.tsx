import Link from "next/link";
import ForageCaptureInbox from "../../components/ForageCaptureInbox";

export default async function ForageCapturesPage({
  searchParams,
}: {
  searchParams: Promise<{ captureId?: string | string[] }>;
}) {
  const requested = (await searchParams).captureId;
  const captureId = (Array.isArray(requested) ? requested[0] : requested)?.trim() ?? "";

  return (
    <section className="screen forage-inbox-screen">
      <div className="forage-page-heading">
        <div>
          <span className="eyebrow">野採・原始材料</span>
          <h1>一般採集匣</h1>
          <p>整理 LINE 剪藏與手動擷取，補上分類、用途、成熟度及知識關聯。</p>
        </div>
        <Link href="/forage">回到野採概覽</Link>
      </div>
      <ForageCaptureInbox initialCaptureId={captureId} />
    </section>
  );
}
