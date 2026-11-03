import {notFound} from 'next/navigation';
import {originalTool} from '@/lib/liaojieTools/catalog';
import {originalDocument} from '@/lib/liaojieTools/document';
import OriginalToolWorkspace from '@/app/components/liaojieTools/OriginalToolWorkspace';
import '@/app/liaojie/tools/tools.css';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{tool:string}>}) {
 const {tool:id}=await params,tool=originalTool(id);if(!tool)notFound();
 const document=await originalDocument(tool.id,'weaving');
 return <OriginalToolWorkspace tool={tool.id} name={tool.name} html={document.html} bridge={document.bridge} realm="weaving"/>;
}
