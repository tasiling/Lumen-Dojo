import LiaojiePublicationWorkbench from "@/app/components/LiaojiePublicationWorkbench";
import Link from 'next/link';
import '../tools/tools.css';

export default async function LiaojieWorkbenchPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <><nav className="original-tool-entry" aria-label="原工具與備份"><Link href="/liaojie/tools">原工具與裝置備份 →</Link><span>保留原方法與舊稿；新版創作請從織光堂進入</span></nav><LiaojiePublicationWorkbench initialId={id ?? null} /></>;
}
