import IllustratedWorkspace from '@/app/components/illustrated/IllustratedWorkspace';
export default async function Page({searchParams}:{searchParams:Promise<{completionId?:string}>}){const params=await searchParams;return <IllustratedWorkspace completionId={params.completionId??null}/>;}
