import AddWorkspace from "../components/AddWorkspace";
export default async function AddPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;
  const mode=params.mode==='reading'?'reading':params.mode==='calendar'?'calendar':'capture';
  return <AddWorkspace key={mode} initialMode={mode}/>;
}
