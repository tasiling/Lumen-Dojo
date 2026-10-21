import LongVideoWorkspace from '@/app/components/longVideo/LongVideoWorkspace';
export default async function Page({searchParams}:{searchParams:Promise<{completionId?:string}>}){const p=await searchParams;return <LongVideoWorkspace completionId={p.completionId??null}/>;}
