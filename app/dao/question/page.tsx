import { DaoQuestionPage } from "@/app/components/dao/DaoQuestions";

export default async function DaoQuestionRoute({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const requested = (await searchParams).id;
  const id = (Array.isArray(requested) ? requested[0] : requested)?.trim() ?? "";
  return <DaoQuestionPage key={id} id={id} />;
}
