import ForagePageHeading from "../../components/ForagePageHeading";
import ForageRefine from "../../components/ForageRefine";

export default async function ForageRefinePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[]; captures?: string | string[] }>;
}) {
  const params = await searchParams;
  const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  const captureIds = first(params.captures).split(",").map((id) => id.trim()).filter(Boolean);
  const id = first(params.id);

  return (
    <section className="screen forage-inbox-screen">
      <ForagePageHeading eyebrow="野採・淬鍊" title="淬鍊" description="帶著逐段編號的原文去和 GPT 討論，貼回後核對是否逐字，再挑出自己說過的話。" />
      <ForageRefine roundId={id} captureIds={captureIds} />
    </section>
  );
}
