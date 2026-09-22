import ModuleDomainPage from "../../components/ModuleDomainPage";

export default function ForageRecordsPage() {
  return (
    <ModuleDomainPage
      title="其他野採紀錄"
      lead="回看不屬於兩個採集匣的場域紀錄，或從這裡開始計時。"
      space="forage"
      defaultKind="野採"
    />
  );
}
