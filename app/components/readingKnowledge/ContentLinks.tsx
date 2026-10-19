import Link from 'next/link';
import { contentKey, KIND_LABELS, type ContentItem } from '@/lib/dojo/readingKnowledge/model';
export default function ContentLinks({ items }: {
    items: ContentItem[];
}) { return <div className="rk-results">{items.map(i => <article className="ritual-card" key={contentKey(i.ref)}><small>{KIND_LABELS[i.ref.kind]} · {i.status}</small><h3><Link href={i.href}>{i.title}</Link></h3><p>{i.text.slice(0, 220)}</p><small>{i.locator}</small><p><Link href={i.href}>開啟原紀錄 →</Link></p></article>)}</div>; }
