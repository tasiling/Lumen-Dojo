// 修習所肌肉學習的固定目錄：五十張卡、九個部位、觸康健十四肌、第一批姿勢型態。
// 這裡只有名稱、歸屬與順序；卡片內容一律由本人貼入，這裡不放任何解剖內容。
// 唯一預填的是觸康健十四肌的對應經絡。

/** 徒手肌力測試採用的分級：全站只在這裡設定一次，卡片上固定顯示。 */
export const MMT_GRADING = "英國醫學研究委員會（MRC）0 到 5 級";

export const REGION_PATHS = [
  { key: "head", name: "頭" },
  { key: "neck", name: "頸" },
  { key: "shoulder", name: "肩" },
  { key: "back", name: "背" },
  { key: "upper-limb", name: "上肢" },
  { key: "gluteal", name: "臀" },
  { key: "thigh", name: "大腿" },
  { key: "leg", name: "小腿" },
  { key: "foot", name: "腳底" },
] as const;
export type RegionKey = typeof REGION_PATHS[number]["key"];
export const TFH_PATH = { key: "touch-for-health", name: "觸康健十四肌" } as const;
export type PathKey = RegionKey | typeof TFH_PATH.key;
export const LEARNING_PATHS: readonly { key: PathKey; name: string }[] = [...REGION_PATHS, TFH_PATH];

export type MuscleEntry = { key: string; name: string; region: RegionKey };
const muscle = (region: RegionKey, list: [string, string][]): MuscleEntry[] =>
  list.map(([key, name]) => ({ key, name, region }));

export const MUSCLES: readonly MuscleEntry[] = [
  ...muscle("head", [["masseter", "咬肌"], ["temporalis", "顳肌"], ["occipitofrontalis", "枕額肌"]]),
  ...muscle("neck", [
    ["sternocleidomastoid", "胸鎖乳突肌"], ["scalenes", "斜角肌"], ["suboccipitals", "枕下肌群"],
    ["splenius", "頭夾肌與頸夾肌"], ["levator-scapulae", "肩胛提肌"],
  ]),
  ...muscle("shoulder", [
    ["upper-trapezius", "上斜方肌"], ["deltoid", "三角肌"], ["supraspinatus", "棘上肌"], ["infraspinatus", "棘下肌"],
    ["teres-minor", "小圓肌"], ["subscapularis", "肩胛下肌"], ["teres-major", "大圓肌"],
    ["pectoralis-major-clavicular", "胸大肌鎖骨部"], ["pectoralis-major-sternal", "胸大肌胸骨部"],
    ["pectoralis-minor", "胸小肌"], ["serratus-anterior", "前鋸肌"],
  ]),
  ...muscle("back", [
    ["middle-trapezius", "中斜方肌"], ["lower-trapezius", "下斜方肌"], ["rhomboids", "菱形肌"],
    ["latissimus-dorsi", "闊背肌"], ["erector-spinae", "豎脊肌"], ["quadratus-lumborum", "腰方肌"], ["multifidus", "多裂肌"],
  ]),
  ...muscle("upper-limb", [
    ["biceps-brachii", "肱二頭肌"], ["triceps-brachii", "肱三頭肌"], ["brachioradialis", "肱橈肌"],
    ["forearm-flexors", "前臂屈肌群"], ["forearm-extensors", "前臂伸肌群"], ["thenar", "大魚際肌群"],
  ]),
  ...muscle("gluteal", [
    ["gluteus-maximus", "臀大肌"], ["gluteus-medius", "臀中肌"], ["gluteus-minimus", "臀小肌"],
    ["piriformis", "梨狀肌"], ["tensor-fasciae-latae", "闊筋膜張肌"],
  ]),
  ...muscle("thigh", [["quadriceps", "股四頭肌"], ["hamstrings", "膕旁肌"], ["adductors", "內收肌群"], ["iliopsoas", "髂腰肌"]]),
  ...muscle("leg", [
    ["gastrocnemius", "腓腸肌"], ["soleus", "比目魚肌"], ["tibialis-anterior", "脛前肌"],
    ["tibialis-posterior", "脛後肌"], ["peroneals", "腓骨肌"],
  ]),
  ...muscle("foot", [
    ["abductor-hallucis", "外展拇肌"], ["flexor-digitorum-brevis", "屈趾短肌"],
    ["quadratus-plantae", "足底方肌"], ["plantar-fascia", "足底筋膜"],
  ]),
];

/** 觸康健十四肌，依測試順序。label 只在觸康健路徑上的名稱與部位卡不同時才有。 */
export type TfhEntry = { muscle: string; meridian: string; label?: string };
export const TFH_MUSCLES: readonly TfhEntry[] = [
  { muscle: "supraspinatus", meridian: "任脈" },
  { muscle: "teres-major", meridian: "督脈" },
  { muscle: "pectoralis-major-clavicular", meridian: "胃經" },
  { muscle: "latissimus-dorsi", meridian: "脾經" },
  { muscle: "subscapularis", meridian: "心經" },
  { muscle: "quadriceps", meridian: "小腸經" },
  { muscle: "peroneals", meridian: "膀胱經" },
  { muscle: "iliopsoas", meridian: "腎經", label: "髂腰肌（腰大肌）" },
  { muscle: "gluteus-medius", meridian: "心包經" },
  { muscle: "teres-minor", meridian: "三焦經" },
  { muscle: "deltoid", meridian: "膽經", label: "三角肌（前束）" },
  { muscle: "pectoralis-major-sternal", meridian: "肝經" },
  { muscle: "serratus-anterior", meridian: "肺經" },
  { muscle: "tensor-fasciae-latae", meridian: "大腸經" },
];

/** 第一批姿勢型態卡（空卡）。之後新增的型態卡存在紀錄裡，不在這裡。 */
export const SEED_PATTERNS: readonly { id: string; name: string }[] = [
  { id: "upper-crossed-syndrome", name: "上交叉症候群" },
  { id: "lower-crossed-syndrome", name: "下交叉症候群" },
];

/** 原有按摩主題與肌肉卡的唯讀對照：只用來在卡片上列出舊紀錄，不搬動任何資料。 */
export const LEGACY_TOPIC_CARDS: readonly { muscle: string; topicName: string; curriculumKey: string }[] = [
  { muscle: "upper-trapezius", topicName: "回看上斜方肌", curriculumKey: "massage-stage-0-topic-0" },
  { muscle: "levator-scapulae", topicName: "辨認肩胛提肌", curriculumKey: "massage-stage-0-topic-1" },
];

export function muscleByKey(key: string): MuscleEntry | undefined {
  return MUSCLES.find((m) => m.key === key);
}
export function tfhEntry(key: string): TfhEntry | undefined {
  return TFH_MUSCLES.find((t) => t.muscle === key);
}
export function isPathKey(key: string): key is PathKey {
  return LEARNING_PATHS.some((p) => p.key === key);
}
/** 某條路徑上的卡，依路徑順序。觸康健路徑用的是部位卡本身，不另建。 */
export function pathMuscles(path: PathKey): { muscle: MuscleEntry; label: string; meridian?: string }[] {
  if (path === TFH_PATH.key)
    return TFH_MUSCLES.map((t) => {
      const m = muscleByKey(t.muscle)!;
      return { muscle: m, label: t.label ?? m.name, meridian: t.meridian };
    });
  return MUSCLES.filter((m) => m.region === path).map((m) => ({ muscle: m, label: m.name }));
}
/** 跳到一張卡時要停在哪條路徑：目前路徑有這張卡就不動，否則切到它的部位。 */
export function pathForMuscle(key: string, current: string | null): PathKey | null {
  const m = muscleByKey(key);
  if (!m) return null;
  if (current && isPathKey(current) && pathMuscles(current).some((p) => p.muscle.key === key)) return current;
  return m.region;
}
