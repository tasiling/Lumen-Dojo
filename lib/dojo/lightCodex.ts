import { GUANGXING, GUANGFA } from "./constants";
export type LightTag = keyof typeof GUANGXING | keyof typeof GUANGFA;
const additions: Record<LightTag, [string,string,string,string]> = {
  ning: ["先回到此刻", "開始前讓身心從散亂回到自己，為接下來的投入留出空間。", "打開工作前深呼吸，感受腳底，再寫下今日意圖。", "凝光先安住當下；聚光是在安住後，把注意力集中到一個目標。"],
  lian: ["反覆練習而純熟", "透過實際操作與回看，逐步讓技能與經驗穩定；重點是反覆實踐。", "再次練習一段英文敘述，注意今天比昨天更自然的地方。", "煉光著重反覆實踐的純熟；守光著重長時間維持穩定狀態。"],
  liu: ["看见真實投入", "留意生命的光流向哪裡，描述專注與參與感，並非用完成率衡量自己。", "閱讀未讀完，仍記下那段全心參與的時間。", "流光關心投入程度；聚光關心投入朝向的一個目標。"],
  xian: ["讓世界接住表達", "把內在理解、創造或心意化成能被他人接住的存在。", "完成並分享一篇文章，讓讀者能看見你的理解。", "顯光是表達與呈現；映光是世界回應後形成的雙向互動。"],
  cang: ["允許恢復蓄積", "主動收回光，讓身體與精神恢復；休息本身有其位置。", "今天提早收工，安靜休息，補回睡眠。", "藏光以恢復為主；隱光以暫不展現、等待作品成熟為主。"],
  ju: ["集中一個目標", "在眾多可能中選定目標，讓光朝這件重要的事集中。", "今天先把講義的一個章節完成。", "聚光選定目標；凝光先把散亂的光聚回自己，安住當下。"],
  shou: ["穩定走一段時間", "在較長的工作、創作或主持過程中，維持穩定的參與狀態。", "主持兩小時討論，持續照顧節奏與注意力。", "守光是長時間穩定；煉光是透過反覆實踐而純熟。"],
  yin: ["等待成熟再展現", "暫不對外展現，讓理解或作品在內部沉澱；醞釀仍在進行。", "暫停更新，回頭整理下一篇作品的線索。", "隱光是醞釀成熟；藏光是恢復蓄積；不必因未發表推定停止。"],
  zhu: ["把祝福留在作品", "作品完成時，讓感謝与祝福隨著作品留存，成為封存的心意。", "講義完成後，寫下一句想送給未來讀者的祝福。", "祝光留下感謝與祝福；顯光讓作品被世界接住，可同時標記。"],
  ying: ["聽見世界的回應", "在表達之後接住留言、討論與回應，讓交流成為雙向互動。", "讀者分享自己的經驗，你回應並一起把問題想深一點。", "映光包含回應與互動；顯光是讓內在的光成為可被接住的存在。"],
};
export const LIGHT_CODEX = Object.entries({...GUANGXING,...GUANGFA}).map(([key,[name,definition,originalExamples]])=>({key:key as LightTag,name,definition,originalExamples,group:key in GUANGXING?"光行":"光法",hint:additions[key as LightTag][0],explanation:additions[key as LightTag][1],example:additions[key as LightTag][2],comparison:additions[key as LightTag][3]}));
export function normalizeLightTags(value:{lightTags?:unknown;guangxing?:unknown;guangfa?:unknown}):LightTag[]{const raw=Array.isArray(value.lightTags)?value.lightTags:[value.guangxing,value.guangfa];return [...new Set(raw.filter((v):v is LightTag=>typeof v==="string"&&LIGHT_CODEX.some(i=>i.key===v)))];}
