import type { WeavingWork } from '@/lib/dojo/weavingShuttle';
export default function CompletionPreview({ work, onConfirm, disabled, showAction = true }: {
    work: WeavingWork;
    onConfirm: () => void;
    disabled: boolean;
    showAction?: boolean;
}) { return <section className="ritual-card wf-preview"><span className="eyebrow">成品預覽</span><h2>{work.title}</h2><p>{work.textWorkflow?.outputKind === 'carousel_copy' ? '交付內容為逐頁文字文案。' : work.textWorkflow?.outputKind === 'spoken_script' ? '交付內容為口播文字稿。' : '確認以下內容可作為本次成品。'}</p><div className="full-text-preview">{work.draftText}</div>{work.outputUrl && <p>{work.outputUrl}</p>}{showAction && <button className="primary" disabled={disabled} onClick={onConfirm}>確認這件作品已織成</button>}</section>; }
