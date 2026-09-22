import { redirect } from "next/navigation";
import ForageHome from "../components/ForageHome";

export default async function ForagePage({
  searchParams,
}: {
  searchParams: Promise<{ englishImageId?: string | string[] }>;
}) {
  const requested = (await searchParams).englishImageId;
  const englishImageId = (Array.isArray(requested) ? requested[0] : requested)?.trim();
  if (englishImageId) redirect(`/forage/english?englishImageId=${encodeURIComponent(englishImageId)}`);

  return <ForageHome />;
}
