import { redirect } from "next/navigation";
import PracticeHome from "../components/PracticeHome";
import { legacyPracticeTarget } from "@/lib/dojo/practiceNavigation";
export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const target = legacyPracticeTarget(await searchParams);
  if (target) redirect(target);
  return <PracticeHome />;
}
