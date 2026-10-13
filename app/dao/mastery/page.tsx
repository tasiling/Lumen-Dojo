import MasteryCollection from '@/app/components/MasteryCollection';
export default async function Page({searchParams}:{searchParams:Promise<{card?:string;learningItem?:string}>}){const query=await searchParams;return <MasteryCollection key={(query.card??'')+':'+(query.learningItem??'')} initialCardId={query.card} initialLearningItem={query.learningItem}/>;}
