import ForagePageHeading from "../../components/ForagePageHeading";
import EnglishImageInbox from "../../components/EnglishImageInbox";

export default function ForageEnglishPage() {
  return (
    <section className="screen forage-inbox-screen">
      <ForagePageHeading eyebrow="野採・學習素材" title="英文影像匣" description="從精簡清單選擇一組素材，再進入詳情理解、挑選與派送。" />
      <EnglishImageInbox />
    </section>
  );
}
