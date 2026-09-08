// R18G 屏蔽词表 —— 分组中英对照结构（个人资料页弹窗供用户勾选）
//
// 匹配口径（重要）：
//   只匹配「正向提示词」中出现的词 —— 即 works.metadata 里的结构化 prompt 字段：
//     顶层 metadata.prompt（字符串）
//     metadata.per_image[*].prompt（多图逐图）
//   **不匹配负向 uc**（负向出现 = 作者已排除，图中不含，不算命中）。
//   **不匹配 rawJson / _raw.workflow**（ComfyUI 完整工作流 JSON，正向负向文本混在节点里）。
//   匹配用单词边界（\b）+ 大小写不敏感：避免 "scat" 误匹配 "subsurface_scattering"、
//   "art" 误匹配 "artist"。
//
// 分组说明：
//   - scat_fecal  粪便类 → 默认勾选（用户主要想屏蔽的）
//   - scat_urine  排尿类 → 默认不勾（单独一组，需要时自己勾）
//   - furry       纯兽人 → 默认勾选（兽耳娘 kemonomimi 不在此列，只屏蔽纯兽人）
//   - guro_gore   血腥暴力 → 默认不勾（提供选项）
//   - body_horror 吞噬猎奇 → 默认不勾（提供选项）
//   - custom      自定义   → 用户自行添加的英文 tag（无预置词）
//
// 存储/匹配粒度是「单个 tag」：分组只是弹窗 UI 组织，用户逐 tag 勾选，
// 保存后展开成扁平屏蔽词列表（selected + custom）。

export interface R18GTag {
  en: string; // 英文 tag（实际匹配用）
  zh: string; // 中文对照（弹窗展示用）
}

/** 用户 R18G 屏蔽偏好（存 users.r18g_pref JSON）—— 只放类型，可被客户端组件安全引用 */
export interface R18GPref {
  /** 总开关：开启后按 selected+custom 屏蔽 */
  enabled: boolean;
  /** 勾选的预置 tag 英文名 */
  selected: string[];
  /** 用户自定义屏蔽词（英文） */
  custom: string[];
}

export interface R18GGroup {
  id: string;
  label: string;
  desc: string;
  defaultOn: boolean; // 打开总开关后，该组 tag 默认被勾选
  tags: R18GTag[];
}

export const R18G_GROUPS: R18GGroup[] = [
  {
    id: "scat_fecal",
    label: "scat · 粪便",
    desc: "画面含粪便 / 排泄物",
    defaultOn: true,
    tags: [
      { en: "scat", zh: "粪玩" },
      { en: "scat play", zh: "粪play" },
      { en: "feces", zh: "粪便" },
      { en: "defecation", zh: "排便" },
      { en: "defecating", zh: "排便中" },
      { en: "excrement", zh: "排泄物" },
      { en: "toilet use", zh: "上厕所" },
      { en: "enema", zh: "灌肠" },
      { en: "pseudo scat", zh: "伪粪玩" },
      { en: "human waste", zh: "人体排泄物" },
    ],
  },
  {
    id: "scat_urine",
    label: "遗尿 · 排尿",
    desc: "画面含尿液 / 失禁",
    defaultOn: false,
    tags: [
      { en: "urination", zh: "排尿" },
      { en: "urinating", zh: "排尿中" },
      { en: "piss", zh: "撒尿" },
      { en: "pissing", zh: "撒尿中" },
      { en: "pee", zh: "小便" },
      { en: "peeing", zh: "小便中" },
      { en: "watersports", zh: "尿play" },
      { en: "golden shower", zh: "金色淋浴" },
      { en: "omorashi", zh: "忍尿" },
    ],
  },
  {
    id: "furry",
    label: "furry · 纯兽人",
    desc: "兽人角色（anthro / yiff 等）",
    defaultOn: true,
    tags: [
      { en: "furry", zh: "兽人" },
      { en: "anthro", zh: "拟人兽" },
      { en: "anthropomorphic", zh: "拟人化" },
      { en: "feral", zh: "野兽形态" },
      { en: "yiff", zh: "兽交" },
      { en: "kemono", zh: "兽体" },
      { en: "animal_humanoid", zh: "兽人形" },
      { en: "furrification", zh: "兽化变身" },
      { en: "furry female", zh: "母兽人" },
      { en: "furry male", zh: "公兽人" },
      { en: "furry with furry", zh: "兽兽互动" },
      { en: "furry with non-furry", zh: "兽人与人类" },
    ],
  },
  {
    id: "guro_gore",
    label: "guro · 血腥暴力",
    desc: "断肢 / 内脏 / 尸体",
    defaultOn: false,
    tags: [
      { en: "guro", zh: "猎奇" },
      { en: "gore", zh: "血腥" },
      { en: "ero_guro", zh: "色情猎奇" },
      { en: "dismemberment", zh: "肢解" },
      { en: "decapitation", zh: "斩首" },
      { en: "disembowelment", zh: "开膛" },
      { en: "mutilation", zh: "毁伤" },
      { en: "evisceration", zh: "掏内脏" },
      { en: "impalement", zh: "穿刺" },
      { en: "severed head", zh: "断头" },
      { en: "severed limb", zh: "断肢" },
      { en: "intestines", zh: "肠子" },
      { en: "entrails", zh: "内脏" },
      { en: "exposed bone", zh: "露骨" },
      { en: "deep wound", zh: "深伤口" },
      { en: "blood pool", zh: "血泊" },
      { en: "corpse", zh: "尸体" },
      { en: "cadaver", zh: "尸体" },
      { en: "cannibalism", zh: "食人" },
      { en: "necrophilia", zh: "恋尸" },
      { en: "castration", zh: "阉割" },
      { en: "execution", zh: "处刑" },
      { en: "torture", zh: "折磨" },
      { en: "ryona", zh: "虐女" },
    ],
  },
  {
    id: "body_horror",
    label: "body horror · 吞噬猎奇",
    desc: "吞噬 / 身体恐怖 / 畸形",
    defaultOn: false,
    tags: [
      { en: "vore", zh: "吞噬" },
      { en: "hard vore", zh: "硬吞噬" },
      { en: "oral vore", zh: "口吞" },
      { en: "anal vore", zh: "肛吞" },
      { en: "unbirth", zh: "子宫吞" },
      { en: "digestion", zh: "消化" },
      { en: "swallowed whole", zh: "整吞" },
      { en: "human meat consumption", zh: "人肉食用" },
      { en: "predation", zh: "捕猎" },
      { en: "body horror", zh: "身体恐怖" },
      { en: "grotesque", zh: "怪诞" },
      { en: "disfigured", zh: "毁容" },
      { en: "mutation", zh: "变异" },
      { en: "skinned", zh: "剥皮" },
      { en: "flayed", zh: "剥皮" },
    ],
  },
  {
    id: "custom",
    label: "自定义",
    desc: "自行添加想屏蔽的英文 tag（逗号分隔）",
    defaultOn: false,
    tags: [],
  },
];

/** 收集所有组 id（弹窗分组用） */
export function allGroupIds(): string[] {
  return R18G_GROUPS.map((g) => g.id);
}

/** 组 id → 组定义 */
export function getGroup(id: string): R18GGroup | null {
  return R18G_GROUPS.find((g) => g.id === id) ?? null;
}

/** 默认勾选的 tag（打开总开关、未自定义时生效）：所有 defaultOn 组的英文 tag */
export function defaultHiddenTags(): string[] {
  const set = new Set<string>();
  for (const g of R18G_GROUPS) {
    if (!g.defaultOn) continue;
    for (const t of g.tags) set.add(t.en.toLowerCase());
  }
  return [...set];
}

/** 用户勾选展开：selected（预置 tag）+ custom（自定义词）合并去重小写 */
export function expandHiddenTags(
  selected: string[],
  custom: string[] = [],
): string[] {
  const set = new Set<string>();
  for (const t of selected) {
    const v = t.trim().toLowerCase();
    if (v) set.add(v);
  }
  for (const t of custom) {
    const v = t.trim().toLowerCase();
    if (v) set.add(v);
  }
  return [...set];
}

/** 把用户自定义输入框的原始字符串拆成词列表（逗号/空格/换行分隔） */
export function parseCustomTags(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}