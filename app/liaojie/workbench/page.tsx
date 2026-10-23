import LiaojiePublicationWorkbench from "@/app/components/LiaojiePublicationWorkbench";
import Link from 'next/link';
import '../tools/tools.css';

export default async function LiaojieWorkbenchPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <><nav className="original-tool-entry" aria-label="創作工具"><Link href="/liaojie/tools">開啟創作工具 →</Link><span>知識鑽石框架 · 日上三更 · 雜誌對話 · IG 輪播</span></nav><LiaojiePublicationWorkbench initialId={id ?? null} /></>;
}
