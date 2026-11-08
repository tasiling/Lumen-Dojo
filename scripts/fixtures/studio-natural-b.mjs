export const natural=`討論回覆
暫建議採用「起承轉合」。主閉合可考慮「情感閉合」；尚未視為本人採用。

候選方向
以下均未採用。
方向\t核心問題候選\t框架建議
回來創作的方式\t想把心力放在哪裡？\t起承轉合，保留第一人稱。
服務與自在選擇\t如何看待付出與選擇？\t只有確認服務信任任務才考慮 SB7。

研究查找狀態
已提供候選。目前只有摘要，沒有全文審查。

研究參考
R1｜研究一的中文名稱
* title：Synthetic study one
* source：Demo（2020），Example Journal。論文 DOI⁠￼。
* mechanism：第一項研究的機制。
* scope：目前只有摘要，不能套用個人因果。
* relation：對應文章的第二段。

R2｜研究二的中文名稱
* title：Synthetic study two
* source：https://example.org/study-two
* mechanism：第二項機制。
* scope：只供虛構測試。
* relation：對應文章的第三段。

例子提案
本輪不另加案例。原稿已有兩個經驗：
* experience｜來源：本次文字。喜歡寫好的文章，後來開始在意數字。
* experience｜來源：本次文字。活動沒有報名，決定重整。
外部案例、假設情境與比喻，本輪未新增。

編輯說明
保留原句和未確定的結果。

候選主文
新的候選第一段。

新的候選第二段。`;

// Chinese enumerated headings from natural GPT output; manuscript remains synthetic.
export const chineseResearch = natural.replace('R1｜研究一的中文名稱','一、研究一的中文名稱').replace('R2｜研究二的中文名稱','二、研究二的中文名稱');

export const proseJsonStudies = [
 {title:'Synthetic study one',source:'Demo（2020），Example Journal。論文 DOI⁠￼。',mechanism:'第一項研究的機制。',scope:'目前只有摘要，不能套用個人因果。',relation:'對應文章的第二段。'},
 {title:'Synthetic study two',source:'https://example.org/study-two',mechanism:'第二項機制。',scope:'只供虛構測試。',relation:'對應文章的第三段。'}
];
export const proseJsonResearch = natural.replace(/研究參考\n[\s\S]*?\n例子提案/, '研究參考\n研究僅供背景，不能推論個人動機。\n\n'+JSON.stringify(proseJsonStudies,null,2)+'\n\n可核對原文：論文連結。\n\n例子提案');

// Same field structure as the user's next GPT response, with a synthetic manuscript.
export const bareResearch = `討論回覆
本輪先討論文章。

研究查找狀態
已提供候選，尚未由本人採用。

研究參考
R1

* title：Synthetic reward study
* source：Demo（2020），Example Journal。DOI：10.1000/demo-one
* mechanism：只供測試的機制一。
* scope：只有摘要，不推論個人因果。
* relation：可作文章背景。

R2

* title：Synthetic motivation study
* source：https://example.org/demo-two
* mechanism：只供測試的機制二。
* scope：測試適用範圍。
* relation：另一段背景。

例子提案
本輪不新增案例。保留原稿經驗：
* experience：活動有人參與。來源：本次草稿。
* experience：暫停之後重新整理生活。來源：本次草稿。

候選主文
候選文章第一段。

候選文章第二段。`;
