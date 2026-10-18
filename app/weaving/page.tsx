import Link from "next/link";
import ModuleDomainPage from "../components/ModuleDomainPage";
import WeavingCaptureInbox from "../components/WeavingCaptureInbox";
import WeavingProjectHub from "../components/WeavingProjectHub";

export default function WeavingPage() {
  return (
    <div className="weaving-clarity"><ModuleDomainPage
      title="織光堂"
      lead="把閱讀與生活裡的體會，寫成一件有自己觀點的作品。"
      space="weaving"
      defaultKind="創作"
      extra={(
        <>
          <WeavingProjectHub />
          <WeavingCaptureInbox />
          <Link href="/backstage" className="backstage-inline-link">內容生產工具已集中到工作後台 →</Link>
        </>
      )}
    /></div>
  );
}
