export type CurriculumTopic = {
  name: string;
  description: string;
  expectedOutcome: string;
  readingFocus?: "anxiety-effort";
};
export type Curriculum = {
  goal: string;
  expectedOutcome: string;
  stages: { name: string; topics: CurriculumTopic[] }[];
};

export const CURRICULUM: Record<string, Curriculum> = {
  "massage": {
    "goal": "從熟悉的頸肩部位延伸到下一塊肌肉。",
    "expectedOutcome": "能指出位置並用自己的話說明動作。",
    "stages": [
      {
        "name": "頸肩與上肢解剖",
        "topics": [
          {
            "name": "回看上斜方肌",
            "description": "用既有紀錄對照一張無標示的圖。",
            "expectedOutcome": "能指出位置並用自己的話說明動作。"
          },
          {
            "name": "辨認肩胛提肌",
            "description": "將肩胛提肌與上斜方肌並排標記。",
            "expectedOutcome": "能在另一張圖指出兩者及辨認依據。"
          },
          {
            "name": "延伸到其他部位",
            "description": "自選胸鎖乳突肌、胸大肌或胸小肌，整理位置與動作。",
            "expectedOutcome": "留下一張有來源的部位筆記。"
          }
        ]
      },
      {
        "name": "工作解說與評估學習",
        "topics": [
          {
            "name": "向客人解說",
            "description": "選一塊已學過的肌肉，用日常語言解釋位置與動作，可加英文。",
            "expectedOutcome": "能獨立說出簡短解說。"
          },
          {
            "name": "評估與禁忌專題",
            "description": "選課程案例，核對教材的評估考量與限制。",
            "expectedOutcome": "記下依據、適用範圍與要向老師確認的問題。"
          }
        ]
      }
    ]
  },
  "yijing": {
    "goal": "從卦形辨認走到重卦與原文。",
    "expectedOutcome": "能說明爻序並重畫。",
    "stages": [
      {
        "name": "讀卦形",
        "topics": [
          {
            "name": "陰陽與爻位",
            "description": "由下往上畫出一個三爻卦，標明陰陽。",
            "expectedOutcome": "能說明爻序並重畫。"
          },
          {
            "name": "八卦辨形與取象",
            "description": "自選兩個容易混淆的卦，對照卦形與教材取象。",
            "expectedOutcome": "能指出差異並各舉一例。"
          }
        ]
      },
      {
        "name": "從重卦到文本",
        "topics": [
          {
            "name": "上下卦互換",
            "description": "把兩個不同經卦上下交換，對照卦表查名。",
            "expectedOutcome": "留下兩張標明上下卦的圖。"
          },
          {
            "name": "讀一卦與一爻",
            "description": "選一卦，分讀卦辭、指定爻辭與註解。",
            "expectedOutcome": "能區分原文、註解與自己的理解。"
          }
        ]
      }
    ]
  },
  "ziwei": {
    "goal": "以同一張命盤逐步加入判讀線索。",
    "expectedOutcome": "能在盤上指出宮位並交代選擇。",
    "stages": [
      {
        "name": "定位與單宮",
        "topics": [
          {
            "name": "十二宮定位",
            "description": "在熟悉的命盤圈出問題涉及的宮位。",
            "expectedOutcome": "能在盤上指出宮位並交代選擇。"
          },
          {
            "name": "星曜與宮位",
            "description": "挑一宮，記下星曜及自己的初步理解。",
            "expectedOutcome": "留下一段可回查的單宮判讀。"
          }
        ]
      },
      {
        "name": "結構與綜合判讀",
        "topics": [
          {
            "name": "加入對宮與三方四正",
            "description": "對照同一張盤，比較加入其他宮位前後的解讀。",
            "expectedOutcome": "指出一條讓判讀改變或更明確的線索。"
          },
          {
            "name": "四化與問題整合",
            "description": "依所學教材標記四化，再回答原來的問題。",
            "expectedOutcome": "列出盤面依據與尚待釐清之處。"
          }
        ]
      }
    ]
  },
  "qimen": {
    "goal": "從讀一宮走到能解釋兩宮關係。",
    "expectedOutcome": "能在盤上找到指定宮位與符號。",
    "stages": [
      {
        "name": "九宮與盤面構成",
        "topics": [
          {
            "name": "干支五行與九宮",
            "description": "選用同一教材與範例盤，對照符號及所在宮位。",
            "expectedOutcome": "能在盤上找到指定宮位與符號。"
          },
          {
            "name": "讀出一宮",
            "description": "逐一指出範例盤一宮的門、星、神與干。",
            "expectedOutcome": "留下標記圖，分開寫觀察與解讀。"
          }
        ]
      },
      {
        "name": "兩宮關係與整盤",
        "topics": [
          {
            "name": "比較兩宮",
            "description": "挑選與問題相關的兩宮，依教材說明一組關係。",
            "expectedOutcome": "能指出符號並解釋選擇依據。"
          },
          {
            "name": "回到原問題",
            "description": "把兩宮關係放回盤面，寫出自己的回答。",
            "expectedOutcome": "留下一段有盤面依據的解讀與疑點。"
          }
        ]
      }
    ]
  },
  "cards": {
    "goal": "自選牌種與語言，以案例交代判讀依據。",
    "expectedOutcome": "指出一個支持解讀的細節。",
    "stages": [
      {
        "name": "塔羅",
        "topics": [
          {
            "name": "牌面與牌位",
            "description": "從煉金七步逐字稿挑一個牌位，回看牌面細節。",
            "expectedOutcome": "指出一個支持解讀的細節。"
          },
          {
            "name": "連結兩個牌位",
            "description": "選同一案例的兩個牌位，說明它們如何共同回答原問題。",
            "expectedOutcome": "留下兩個牌位的關聯與回答。"
          },
          {
            "name": "整合牌陣敘述",
            "description": "自選中文或英文重述整個牌陣。",
            "expectedOutcome": "說出整體解讀及主要依據。"
          }
        ]
      },
      {
        "name": "雷諾曼",
        "topics": [
          {
            "name": "雙牌組合",
            "description": "針對具體問題，對同一組雙牌試寫兩種讀法。",
            "expectedOutcome": "能交代選擇其中一種的理由。"
          },
          {
            "name": "三牌連讀",
            "description": "把第三張加入同一問題，重讀整組牌。",
            "expectedOutcome": "能指出新增的牌如何影響解讀。"
          },
          {
            "name": "較長牌列",
            "description": "選一個既有案例，自選語言串起牌列。",
            "expectedOutcome": "留下連貫回答與對應的組合。"
          }
        ]
      }
    ]
  },
  "psychology": {
    "goal": "從在意的問題出發，用閱讀與討論整理自己的理解。",
    "expectedOutcome": "能以自己的話回答並留下一個理由、例子或待查處。",
    "stages": [
      {
        "name": "問題探索與基礎自學",
        "topics": [
          {
            "name": "從焦慮與努力提問",
            "description": "保留讀前問題與閱讀來源，再用 GPT 討論自己的理解。",
            "expectedOutcome": "能以自己的話回答並留下一個理由、例子或待查處。",
            "readingFocus": "anxiety-effort"
          },
          {
            "name": "選讀一個基礎主題",
            "description": "從認知、情緒與動機、發展或社會心理選一題。",
            "expectedOutcome": "留下一則附來源的概念筆記與生活例子。"
          }
        ]
      },
      {
        "name": "研究方法與先修",
        "topics": [
          {
            "name": "辨認證據與限制",
            "description": "選一份讀得到的研究，找出問題、方法和作者提出的限制。",
            "expectedOutcome": "能指出哪些說法有資料支持。"
          },
          {
            "name": "探索課程先修",
            "description": "有感興趣的課程時，核對課程內容與自己的準備。",
            "expectedOutcome": "留下課程來源與想先補的一項能力。"
          }
        ]
      }
    ]
  },
  "chinese-medicine": {
    "goal": "選定教材，讀懂一個基礎概念並記下出處。",
    "expectedOutcome": "能指出出處並說明自己的理解。",
    "stages": [
      {
        "name": "基礎概念與教材閱讀",
        "topics": [
          {
            "name": "教材用語與陰陽五行",
            "description": "選一本教材，對照原句解釋一個概念。",
            "expectedOutcome": "能指出出處並說明自己的理解。"
          },
          {
            "name": "藏象",
            "description": "在同一教材找出藏象的定義，再比較另一段用例。",
            "expectedOutcome": "能用自己的話解釋用詞並指出原文依據。"
          },
          {
            "name": "氣血津液與經絡",
            "description": "自選一個主題，對照教材的文字與示圖。",
            "expectedOutcome": "留下一則有出處的筆記與待釐清處。"
          }
        ]
      },
      {
        "name": "課程先修與升學探索",
        "topics": [
          {
            "name": "對照先修課程",
            "description": "有目標課程時，依課綱核對已讀與待補主題。",
            "expectedOutcome": "列出一個接下來可讀的單元。"
          },
          {
            "name": "評估升學方向",
            "description": "若想探索學士後中醫，記下目標學程與要查證的條件。",
            "expectedOutcome": "留下資料來源與尚待決定的問題。"
          }
        ]
      }
    ]
  },
  "english": {
    "goal": "近期以 B2 為目標，長期達到 C1。",
    "expectedOutcome": "",
    "stages": []
  }
};

export function plannedStages(itemKey: string) {
  const oldCard = itemKey === "tarot" ? "塔羅" : itemKey === "lenormand" ? "雷諾曼" : null;
  const key = oldCard ? "cards" : itemKey;
  return (CURRICULUM[key]?.stages ?? []).flatMap((stage, index) => {
    if (oldCard && stage.name !== oldCard) return [];
    const stageKey = key + "-stage-" + index;
    return [{ name: stage.name, key: stageKey, topics: stage.topics.map((topic, position) => ({
      ...topic, key: stageKey + "-topic-" + position,
    })) }];
  });
}
