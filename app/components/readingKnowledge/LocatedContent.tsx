'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export function LocatedContent({ parameter, id, children }: {
    parameter: 'note' | 'card' | 'claim';
    id: string;
    children: ReactNode;
}) { const ref = useRef<HTMLDivElement>(null); useEffect(() => { if (new URLSearchParams(location.search).get(parameter) !== id)
    return; const timer = setTimeout(() => { ref.current?.scrollIntoView({ block: 'center' }); ref.current?.focus({ preventScroll: true }); }, 100); return () => clearTimeout(timer); }, [parameter, id]); return <div ref={ref} tabIndex={-1} data-rk-id={id} style={{ scrollMarginBlock: '100px', minWidth: 0 }}>{children}</div>; }
