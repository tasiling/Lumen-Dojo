import ModuleDomainPage from "../components/ModuleDomainPage";
import ForageCaptureInbox from "../components/ForageCaptureInbox";

export default function ForagePage() {
  return (
    <ModuleDomainPage
      title="野採"
      lead="把問題、閱讀、對話與素材撿起來；不必立刻做成作品。"
      space="forage"
      defaultKind="野採"
      extra={<ForageCaptureInbox />}
    />
  );
}
