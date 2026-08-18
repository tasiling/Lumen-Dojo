import Link from "next/link";

const CORE_TOOLS = [
  { href: "/sanko", title: "日上三更", note: "IG 晨光、日光、夜光的批次規劃與產出。" },
  { href: "/sessions", title: "任務管理站", note: "Session、明細、狀態與產出連結。" },
  { href: "/generate", title: "組稿台", note: "以牌卡、規則與知識庫組成可審核草稿。" },
  { href: "/expand", title: "序列展開", note: "依活動場次展開宣傳節點與日期。" },
  { href: "/production-day", title: "生產日工作台", note: "集中處理主題、服務、知識與產出。" },
  { href: "/feedback", title: "快速評分", note: "記錄產出回饋，供規則修正使用。" },
] as const;

export default function BackstagePage() {
  return (
    <section className="screen backstage-screen">
      <div className="hero backstage-hero">
        <div className="eyebrow">工作後台</div>
        <h1>內容生產集中在這裡</h1>
        <p>這裡處理 IG 與正式內容產線；不會進入個人的晨間啟動、日間札記或晚間收光。</p>
      </div>

      <div className="backstage-grid">
        {CORE_TOOLS.map((tool) => (
          <Link key={tool.href} href={tool.href} className="backstage-link">
            <b>{tool.title}</b>
            <small>{tool.note}</small>
            <span>進入 →</span>
          </Link>
        ))}
      </div>

      <section className="ritual-card">
        <span className="eyebrow">其他既有產線</span>
        <h2>噗浪蓋樓台</h2>
        <p className="lead">既有範本、草稿與 Notion 資料仍完整保留。</p>
        <Link href="/plurk" className="button-link">進入噗浪蓋樓台</Link>
      </section>
    </section>
  );
}
