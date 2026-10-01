import { Suspense } from "react";
import { notFound } from "next/navigation";
import { WORKSPACES } from "@/lib/dojo/practiceNavigation";
import PracticeWorkspace from "../../components/PracticeWorkspace";
export default async function WorkspacePage({params}: {params: Promise<{workspace:string}>}) {
  const {workspace} = await params;
  if (!(WORKSPACES as readonly string[]).includes(workspace)) notFound();
  let vocabularyUrl: string | undefined;
  if (workspace === "vocabulary") {
    try { const u = new URL(process.env.VOCABFORGE_INTEGRATION_URL ?? ""); if(u.protocol === "https:" && !u.username && !u.password) vocabularyUrl = u.origin; } catch {}
  }
  return <Suspense fallback={<p>正在開啟工作空間…</p>}><PracticeWorkspace workspace={workspace} vocabularyUrl={vocabularyUrl} /></Suspense>;
}
