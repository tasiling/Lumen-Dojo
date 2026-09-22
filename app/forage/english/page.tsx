import Link from "next/link";
import EnglishImageInbox from "../../components/EnglishImageInbox";

export default function ForageEnglishPage() {
  return (
    <section className="screen forage-inbox-screen">
      <div className="forage-page-heading">
        <div>
          <span className="eyebrow">野採・學習素材</span>
          <h1>英文影像匣</h1>
          <p>從精簡清單選擇一組素材，再進入詳情理解、挑選與派送。</p>
        </div>
        <Link href="/forage">回到野採概覽</Link>
      </div>
      <EnglishImageInbox />
    </section>
  );
}
