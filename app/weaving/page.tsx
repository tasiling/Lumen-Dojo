import Link from "next/link";
import "../components/creativeSources/sourceSettings.css";
import ModuleDomainPage from "../components/ModuleDomainPage";
import WeavingCaptureInbox from "../components/WeavingCaptureInbox";
import StudioHome from "../components/creativeStudio/StudioHome";

export default function WeavingPage() {
  return (
    <div className="weaving-clarity"><ModuleDomainPage
      title="織光堂"
      lead="把閱讀與生活裡的體會，寫成一件有自己觀點的作品。"
      space="weaving"
      defaultKind="創作"
      extra={(
        <>
          <StudioHome />
          <details><summary>查看野採已採用素材</summary><WeavingCaptureInbox /></details>
          <Link href="/liaojie/tools" className="backstage-inline-link">原工具與裝置備份 →</Link>
        </>
      )}
    /></div>
  );
}
