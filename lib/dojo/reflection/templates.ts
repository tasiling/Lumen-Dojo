import type { ReflectionTool } from "./model";
export const REFLECTION_TOOLS: ReflectionTool[] = [
  {
    "id": "awareness",
    "name": "情緒覺察筆記",
    "version": 1,
    "hint": "情緒與需求可複選或自訂，選項不會替你填答。",
    "questions": [
      {
        "id": "awareness.q1",
        "text": "今天發生了什麼事情？"
      },
      {
        "id": "awareness.q2",
        "text": "當時，我有哪些情緒或感受？"
      },
      {
        "id": "awareness.q3",
        "text": "這些感受在身體上有什麼反應？"
      },
      {
        "id": "awareness.q4",
        "text": "當時，我腦中出現了什麼想法？"
      },
      {
        "id": "awareness.q5",
        "text": "此刻的我，最需要的是什麼？"
      },
      {
        "id": "awareness.q6",
        "text": "經過整理後，我現在的感受有什麼變化？"
      }
    ],
    "modes": {
      "light": [
        "awareness.q1",
        "awareness.q2",
        "awareness.q5"
      ],
      "moderate": [
        "awareness.q1",
        "awareness.q2",
        "awareness.q3",
        "awareness.q4",
        "awareness.q5"
      ],
      "deep": [
        "awareness.q1",
        "awareness.q2",
        "awareness.q3",
        "awareness.q4",
        "awareness.q5",
        "awareness.q6"
      ]
    }
  },
  {
    "id": "roots",
    "name": "情緒溯源",
    "version": 1,
    "hint": "過去經歷可跳過；不存在、想不起來或不想探索都可以。",
    "questions": [
      {
        "id": "roots.q1",
        "text": "最近是哪件事情，讓我產生了比較強烈的情緒？"
      },
      {
        "id": "roots.q2",
        "text": "事情發生的當下，我最在意的是什麼？"
      },
      {
        "id": "roots.q3",
        "text": "我當時如何理解對方的行為，或這件事情的意義？"
      },
      {
        "id": "roots.q4",
        "text": "這種感受，是否讓我想起過去類似的經歷？"
      },
      {
        "id": "roots.q5",
        "text": "在這段經歷中，我有哪些沒有被滿足的需求？"
      },
      {
        "id": "roots.q6",
        "text": "如果重新理解這件事，是否存在其他可能的角度？"
      },
      {
        "id": "roots.q7",
        "text": "經過探索，我對自己的反應有什麼新的認識？"
      }
    ],
    "modes": {
      "light": [
        "roots.q1",
        "roots.q2",
        "roots.q5"
      ],
      "moderate": [
        "roots.q1",
        "roots.q2",
        "roots.q3",
        "roots.q5",
        "roots.q7"
      ],
      "deep": [
        "roots.q1",
        "roots.q2",
        "roots.q3",
        "roots.q4",
        "roots.q5",
        "roots.q6",
        "roots.q7"
      ]
    }
  },
  {
    "id": "dialogue",
    "name": "內在對話",
    "version": 1,
    "hint": "既有創現角色可選可不選；由你自己書寫每個聲音。",
    "questions": [
      {
        "id": "dialogue.q1",
        "text": "此刻的我，有什麼想說的？"
      },
      {
        "id": "dialogue.q2",
        "text": "我的內在，還有哪些不同的聲音？"
      },
      {
        "id": "dialogue.q3",
        "text": "這些聲音各自在擔心或期待什麼？"
      },
      {
        "id": "dialogue.q4",
        "text": "如果有一個理解我的自己，他會如何回應？"
      },
      {
        "id": "dialogue.q5",
        "text": "聽見這些回應後，此刻的我還想說什麼？"
      },
      {
        "id": "dialogue.q6",
        "text": "這段對話，讓我看見了什麼？"
      }
    ],
    "modes": {
      "light": [
        "dialogue.q1",
        "dialogue.q4",
        "dialogue.q5"
      ],
      "moderate": [
        "dialogue.q1",
        "dialogue.q2",
        "dialogue.q3",
        "dialogue.q4",
        "dialogue.q5"
      ],
      "deep": [
        "dialogue.q1",
        "dialogue.q2",
        "dialogue.q3",
        "dialogue.q4",
        "dialogue.q5",
        "dialogue.q6"
      ]
    }
  },
  {
    "id": "beliefs",
    "name": "信念探索",
    "version": 1,
    "hint": "信念未必錯誤，也未必需要放下；目前沒有／不確定都可以。",
    "questions": [
      {
        "id": "beliefs.q1",
        "text": "最近有哪個想法或信念，讓我特別在意？"
      },
      {
        "id": "beliefs.q2",
        "text": "我通常在什麼情況下，會出現這個想法？"
      },
      {
        "id": "beliefs.q3",
        "text": "我認為這個想法是怎麼形成的？"
      },
      {
        "id": "beliefs.q4",
        "text": "這個信念曾經如何幫助或保護我？"
      },
      {
        "id": "beliefs.q5",
        "text": "現在，它又在哪些地方限制了我？"
      },
      {
        "id": "beliefs.q6",
        "text": "有沒有其他證據或經驗，能讓我重新理解這個信念？"
      },
      {
        "id": "beliefs.q7",
        "text": "如果不再完全受這個信念限制，我希望如何看待這件事？"
      },
      {
        "id": "beliefs.q8",
        "text": "我想保留、調整或放下其中的哪些部分？"
      }
    ],
    "modes": {
      "light": [
        "beliefs.q1",
        "beliefs.q6",
        "beliefs.q8"
      ],
      "moderate": [
        "beliefs.q1",
        "beliefs.q2",
        "beliefs.q4",
        "beliefs.q6",
        "beliefs.q8"
      ],
      "deep": [
        "beliefs.q1",
        "beliefs.q2",
        "beliefs.q3",
        "beliefs.q4",
        "beliefs.q5",
        "beliefs.q6",
        "beliefs.q7",
        "beliefs.q8"
      ]
    }
  },
  {
    "id": "care",
    "name": "自我照顧與界線",
    "version": 1,
    "hint": "行動只保存在筆記中；界線不要求別人一定接受。",
    "questions": [
      {
        "id": "care.q1",
        "text": "最近有什麼事情讓我感到疲憊、勉強或不舒服？"
      },
      {
        "id": "care.q2",
        "text": "我當時是如何回應這件事情的？"
      },
      {
        "id": "care.q3",
        "text": "我有沒有忽略自己的某些需求或感受？"
      },
      {
        "id": "care.q4",
        "text": "如果可以重新選擇，我希望如何回應？"
      },
      {
        "id": "care.q5",
        "text": "我希望建立或維持什麼樣的界線？"
      },
      {
        "id": "care.q6",
        "text": "目前有哪些我能夠做到的自我照顧方式？"
      },
      {
        "id": "care.q7",
        "text": "接下來，我想為自己做一件什麼事情？"
      }
    ],
    "modes": {
      "light": [
        "care.q1",
        "care.q5",
        "care.q7"
      ],
      "moderate": [
        "care.q1",
        "care.q2",
        "care.q3",
        "care.q5",
        "care.q7"
      ],
      "deep": [
        "care.q1",
        "care.q2",
        "care.q3",
        "care.q4",
        "care.q5",
        "care.q6",
        "care.q7"
      ]
    }
  },
  {
    "id": "gratitude",
    "name": "感恩與美好時刻",
    "version": 1,
    "hint": "不需要強迫正向，也可以暫時留白。",
    "questions": [
      {
        "id": "gratitude.q1",
        "text": "最近有什麼讓我感到開心、感動或感謝的事情？"
      },
      {
        "id": "gratitude.q2",
        "text": "這件事情是怎麼發生的？"
      },
      {
        "id": "gratitude.q3",
        "text": "當時有哪些細節讓我特別印象深刻？"
      },
      {
        "id": "gratitude.q4",
        "text": "那個時刻，我感受到了什麼？"
      },
      {
        "id": "gratitude.q5",
        "text": "這段經歷對我而言，有什麼特別的意義？"
      },
      {
        "id": "gratitude.q6",
        "text": "如果想對當時的人、事、物或自己說一句話，我想說什麼？"
      },
      {
        "id": "gratitude.q7",
        "text": "我想如何珍藏這段經歷？"
      }
    ],
    "modes": {
      "light": [
        "gratitude.q1",
        "gratitude.q4",
        "gratitude.q6"
      ],
      "moderate": [
        "gratitude.q1",
        "gratitude.q3",
        "gratitude.q4",
        "gratitude.q5",
        "gratitude.q6"
      ],
      "deep": [
        "gratitude.q1",
        "gratitude.q2",
        "gratitude.q3",
        "gratitude.q4",
        "gratitude.q5",
        "gratitude.q6",
        "gratitude.q7"
      ]
    }
  }
];
