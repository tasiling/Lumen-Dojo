import IllustratedWorkspace from '@/app/components/illustrated/IllustratedWorkspace';
export default async function Page({ searchParams }: {
    searchParams: Promise<{
        completionId?: string;
        deckId?: string;
    }>;
}) { const p = await searchParams; return <IllustratedWorkspace realm="liaojie" completionId={p.completionId ?? null} deckId={p.deckId ?? null}/>; }
