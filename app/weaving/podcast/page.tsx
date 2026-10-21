import PodcastWorkspace from '@/app/components/podcast/PodcastWorkspace';
export default async function PodcastPage({searchParams}:{searchParams:Promise<{completionId?:string}>}){const p=await searchParams;return <PodcastWorkspace completionId={p.completionId??null}/>;}
