import Link from "next/link";
import CreativeIcon from "../components/creative/CreativeIcon";
import "../components/creativeSources/sourceSettings.css";
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
          <Link href="/weaving/proposals" className="creative-source-settings-entry"><CreativeIcon name="compass"/><span><b>點點的提案</b><small>從允許素材找題，修改試寫，再選定開工</small></span><CreativeIcon name="chevron"/></Link>
          <Link href="/weaving/sources" className="creative-source-settings-entry"><CreativeIcon name="eye"/><span><b>來源與公開設定</b><small>分別決定點點能否取材、來源能否公開</small></span><CreativeIcon name="chevron"/></Link>
          <WeavingCaptureInbox />
          <Link href="/backstage" className="backstage-inline-link">內容生產工具已集中到工作後台 →</Link>
        </>
      )}
    /></div>
  );
}
