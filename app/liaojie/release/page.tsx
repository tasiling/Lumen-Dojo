import ReleaseRecord from '@/app/components/creativeReleases/ReleaseRecord';
export default async function ReleasePage({searchParams}:{searchParams:Promise<{id?:string}>}){const{id}=await searchParams;return <ReleaseRecord id={id??''}/>;}
