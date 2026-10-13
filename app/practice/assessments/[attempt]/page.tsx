import AssessmentAttempt from '../../../components/AssessmentAttempt';
export default async function Page({params}:{params:Promise<{attempt:string}>}){const {attempt}=await params;return <AssessmentAttempt key={attempt} id={attempt}/>;}
