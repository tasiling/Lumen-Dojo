import ForagePageHeading from "../../components/ForagePageHeading";
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
      <ForagePageHeading eyebrow="野採・原始材料" title="一般採集匣" description="整理 LINE 剪藏與手動擷取，補上分類、用途、成熟度及知識關聯。" />
      <ForageCaptureInbox initialCaptureId={captureId} />
    </section>
  );
}
