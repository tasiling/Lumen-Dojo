import Link from "next/link";
import ModuleDomainPage from "../components/ModuleDomainPage";

export default function WeavingPage() {
  return (
    <ModuleDomainPage
      title="織光堂"
      lead="把採回的素材織成草稿、牌卡、作品與版本。"
      space="weaving"
      defaultKind="創作"
      extra={<Link href="/backstage" className="backstage-inline-link">內容生產工具已集中到工作後台 →</Link>}
    />
  );
}
