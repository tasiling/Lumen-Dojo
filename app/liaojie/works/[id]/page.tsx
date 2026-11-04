import StudioWorkspace from '@/app/components/creativeStudio/StudioWorkspace';
export default async function Page({ params, searchParams }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ entry?: string }>;
}) {
    const [{ id }, query] = await Promise.all([params, searchParams]);
    return <StudioWorkspace id={id} realm="liaojie" startInWriting={query.entry === 'write'}/>;
}
