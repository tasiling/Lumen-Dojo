import { type WorkflowStep } from '@/lib/dojo/weavingWorkflow/model';
import { CREATIVE_STEPS } from '@/lib/dojo/creativeWorkflowSteps';
import CreativeIcon from '../creative/CreativeIcon';
const LABELS: Record<WorkflowStep, string> = { sources: '選材', concept: '構思', production: '製作', review: '確認', handoff: '交接' };
export default function WorkflowNavigation({ step, onChange }: {
    step: WorkflowStep;
    onChange: (step: WorkflowStep) => void;
}) { return <nav className="wf-steps" aria-label="文字創作步驟">{CREATIVE_STEPS.map((s, i) => <button key={s.key} aria-label={`${i + 1} ${LABELS[s.key]}：${s.label}`} aria-current={s.key === step ? 'step' : undefined} onClick={() => onChange(s.key)}><span className="creative-step-symbol"><CreativeIcon name={s.icon}/></span><b>{s.label}</b></button>)}</nav>; }
