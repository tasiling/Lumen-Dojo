import CreativeIcon from '../components/creative/CreativeIcon';
import Link from "next/link";
import ModuleDomainPage from "../components/ModuleDomainPage";

export default function LiaojiePage() {
  return (
    <ModuleDomainPage
      title="聊解室"
      lead="服務與對外工作的場域，保留脈絡，也守住生活與內容產線的界線。"
      space="liaojie"
      defaultKind="服務脈絡"
      extra={<>
        <section className="ritual-card liaojie-workbench-entry">
          <CreativeIcon name="chat" className="creative-section-icon"/><span className="eyebrow">品牌編排與發布</span>
          <h2>聊解室工作台</h2>
          <p className="lead">接收織光堂已完成作品，整理首發平台、標題、封面文案與 CTA。</p>
          <Link href="/liaojie/workbench" className="button-link">進入工作台 <CreativeIcon name="chevron"/></Link>
          <Link href="/liaojie/releases" className="backstage-inline-link">作品發布回看 <CreativeIcon name="eye"/></Link>
          <Link href="/backstage" className="backstage-inline-link">既有 IG 與內容產線請進工作後台 <CreativeIcon name="chevron"/></Link>
        </section>
      </>}
    />
  );
}
