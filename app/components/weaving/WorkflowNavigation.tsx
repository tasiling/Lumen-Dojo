import { WORKFLOW_STEPS, type WorkflowStep } from '@/lib/dojo/weavingWorkflow/model';
const LABELS: Record<WorkflowStep, string> = { sources: '選材', concept: '構思', production: '製作', review: '確認', handoff: '交接' };
export default function WorkflowNavigation({ step, onChange }: {
    step: WorkflowStep;
    onChange: (step: WorkflowStep) => void;
}) { return <nav className="wf-steps" aria-label="文字創作步驟">{WORKFLOW_STEPS.map((s, i) => <button key={s} aria-current={s === step ? 'step' : undefined} onClick={() => onChange(s)}><span>{i + 1}</span>{LABELS[s]}</button>)}</nav>; }
