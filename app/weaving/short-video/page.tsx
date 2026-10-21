import VideoWorkspace from '@/app/components/shortVideo/VideoWorkspace';
export default async function Page({searchParams}:{searchParams:Promise<{completionId?:string}>}){const p=await searchParams;return <VideoWorkspace completionId={p.completionId??null}/>;}
