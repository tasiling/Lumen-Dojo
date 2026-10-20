import { CREATIVE_STEPS } from '@/lib/dojo/creativeWorkflowSteps';
import CreativeIcon from './CreativeIcon';
export default function CreativeFlowOverview() {
  return <ol className="creative-flow-overview" aria-label="創作流程">{CREATIVE_STEPS.map(step=><li key={step.key}><span><CreativeIcon name={step.icon}/></span><b>{step.label}</b></li>)}</ol>;
}
