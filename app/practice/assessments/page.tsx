import AssessmentWorkspace from '../../components/AssessmentWorkspace';
export default async function AssessmentPage({searchParams}:{searchParams:Promise<{learningItem?:string}>}){const query=await searchParams;return <AssessmentWorkspace key={query.learningItem??'all'} initialLearningItem={query.learningItem}/>;}
