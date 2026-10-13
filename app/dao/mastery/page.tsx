import MasteryCollection from '@/app/components/MasteryCollection';
export default async function Page({searchParams}:{searchParams:Promise<{card?:string}>}){const query=await searchParams;return <MasteryCollection initialCardId={query.card}/>;}
