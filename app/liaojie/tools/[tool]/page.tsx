import { notFound } from 'next/navigation';
import { originalTool } from '@/lib/liaojieTools/catalog';
import { originalDocument } from '@/lib/liaojieTools/document';
import OriginalToolWorkspace from '@/app/components/liaojieTools/OriginalToolWorkspace';
import '../tools.css';
export const dynamic = 'force-dynamic';
export default async function ToolPage({ params }: { params: Promise<{tool: string}> }) {
  const {tool: id} = await params, tool = originalTool(id);
  if (!tool) notFound();
  const document = await originalDocument(tool.id);
  return <OriginalToolWorkspace tool={tool.id} name={tool.name} html={document.html} bridge={document.bridge}/>;
}
