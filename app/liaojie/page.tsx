import Link from "next/link";
import ModuleDomainPage from "../components/ModuleDomainPage";

export default function LiaojiePage() {
  return (
    <ModuleDomainPage
      title="聊解室"
      lead="服務與對外工作的場域，保留脈絡，也守住生活與內容產線的界線。"
      space="liaojie"
      defaultKind="服務脈絡"
      extra={<Link href="/backstage" className="backstage-inline-link">IG 與內容產線請進工作後台 →</Link>}
    />
  );
}
