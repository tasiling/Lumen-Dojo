import ComicWorkspace from '@/app/components/comic/ComicWorkspace';
export default async function Page({searchParams}:{searchParams:Promise<{completionId?:string}>}){const params=await searchParams;return <ComicWorkspace completionId={params.completionId??null}/>;}
