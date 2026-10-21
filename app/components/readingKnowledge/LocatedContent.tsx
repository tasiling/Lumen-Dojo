'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export function LocatedContent({ parameter, id, children, fragment }: {
    parameter: 'note' | 'card' | 'claim';
    id: string;
    children: ReactNode;
    fragment?: 'reflection';
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get(parameter) !== id || (parameter === 'note' && (params.get('fragment') ?? undefined) !== fragment))
            return;
        const timer = setTimeout(() => { ref.current?.scrollIntoView({ block: 'center' }); ref.current?.focus({ preventScroll: true }); }, 100);
        return () => clearTimeout(timer);
    }, [parameter, id, fragment]);
    return <div ref={ref} tabIndex={-1} data-rk-id={fragment ? `${id}:reflection` : id} data-rk-fragment={fragment} style={{ scrollMarginBlock: '100px', minWidth: 0 }}>{children}</div>;
}
