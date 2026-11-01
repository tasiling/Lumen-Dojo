import StudioWorkspace from '@/app/components/creativeStudio/StudioWorkspace';
export default async function Page({ params }: {
    params: Promise<{
        id: string;
    }>;
}) { const { id } = await params; return <StudioWorkspace id={id}/>; }
