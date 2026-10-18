import { WORKFLOW_STEPS, type WorkflowStep } from '@/lib/dojo/weavingWorkflow/model';
const LABELS: Record<WorkflowStep, string> = { sources: '選材', concept: '構思', production: '製作', review: '確認', handoff: '交接' };
const ACTIONS: Record<WorkflowStep, string> = { sources: '選素材', concept: '定觀點', production: '寫內容', review: '預覽定稿', handoff: '準備發布' };
export default function WorkflowNavigation({ step, onChange }: {
    step: WorkflowStep;
    onChange: (step: WorkflowStep) => void;
}) { return <nav className="wf-steps" aria-label="文字創作步驟">{WORKFLOW_STEPS.map((s, i) => <button key={s} aria-label={`${i + 1} ${LABELS[s]}：${ACTIONS[s]}`} aria-current={s === step ? 'step' : undefined} onClick={() => onChange(s)}><span>{i + 1}</span>{ACTIONS[s]}</button>)}</nav>; }
