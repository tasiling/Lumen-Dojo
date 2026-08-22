import { redirect } from "next/navigation";

// 舊收光頁已合併進「今天」的晚間收光。保留這條路由，讓既有書籤與歷史
// 入口不會落到 404；資料仍由回看頁讀取，不做刪除或遷移。
export default function ClosingRedirect() {
  redirect("/#today-closing");
}
