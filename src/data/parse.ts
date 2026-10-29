/**
 * 一句话记账：「午饭 牛肉面 28」→ 金额 + 备注 + 分类。
 * 分类依次取：这句备注记过的分类 → 内置关键词 → 未识别（界面让用户点一下，AI 可选兜底）。
 * 金额取句子里最后一个数字（「2 杯咖啡 36」记 36），可带「元 / 块 / ¥」；开头写「昨天 / 前天」记到那天。
 */
import type { Category } from "./model";
import { parseYuan } from "./model";

export interface Draft {
  /** 0 = 今天，-1 = 昨天，-2 = 前天 */
  dayOffset: number;
  note: string;
  cents: number | null;
  category: string | null;
  source: "alias" | "keyword" | null;
}

// 只对默认分类生效；用户改名或新建的分类靠记忆和 AI
const KEYWORDS: readonly [string, RegExp][] = [
  ["food", /饭|餐|面|粉|粥|包子|饺子|外卖|食堂|奶茶|咖啡|瑞幸|星巴克|喜茶|茶|饮料|水果|零食|夜宵|烧烤|火锅|买菜|超市生鲜|蛋糕|甜品|麦当劳|肯德基/],
  ["trans", /打车|滴滴|出租|地铁|公交|高铁|火车|机票|航班|加油|停车|过路|共享单车|单车|地铁卡/],
  ["home", /房租|租金|水电|电费|水费|燃气|物业|话费|宽带|网费/],
  ["fun", /电影|演出|游戏|会员|订阅|视频|音乐|门票|景点|ktv|KTV|旅行|旅游|酒店|民宿/],
  ["social", /红包|份子|请客|礼物|送礼|聚餐|随礼|生日/],
  ["shop", /淘宝|京东|拼多多|天猫|买了|衣服|裤|鞋|包|数码|手机|耳机|日用|纸巾|洗衣|超市/],
];

// 千分位（1,299）或普通数字，最多两位小数；三位小数的整段不当金额，避免「3.555」被截成 3.55
const AMOUNT_RE = /[¥￥]?\s*((?:\d{1,3}(?:[,，]\d{3})+|\d+)(?:\.\d+)?)(?![\d,，])\s*(?:元|块钱?|rmb|RMB)?/g;

/** 备注的记忆键：去空白、全角转半角、小写 */
export function aliasKey(note: string): string {
  return note.normalize("NFKC").replace(/\s+/g, "").toLowerCase().slice(0, 48);
}

export function parseLine(text: string, categories: readonly Category[], aliases: Record<string, string>): Draft | null {
  let line = text.trim();
  const day = line.match(/^(昨天|昨日|前天)\s*/);
  const dayOffset = day ? (day[1] === "前天" ? -2 : -1) : 0;
  if (day) line = line.slice(day[0].length);
  if (!line) return null;
  const matches = [...line.matchAll(AMOUNT_RE)];
  const last = matches[matches.length - 1];
  const cents = last ? parseYuan(last[1]) : null;
  const note = (last ? line.slice(0, last.index) + line.slice(last.index! + last[0].length) : line)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const ids = new Set(categories.map(c => c.id));
  const remembered = note ? aliases[aliasKey(note)] : undefined;
  if (remembered && ids.has(remembered)) return { dayOffset, note, cents, category: remembered, source: "alias" };
  // 按名字直接写分类：「人情 600」
  const named = categories.find(c => note === c.name || note.startsWith(`${c.name} `));
  if (named) return { dayOffset, note, cents, category: named.id, source: "keyword" };
  for (const [id, re] of KEYWORDS) if (ids.has(id) && re.test(note)) return { dayOffset, note, cents, category: id, source: "keyword" };
  return { dayOffset, note, cents, category: null, source: null };
}

export const CLASSIFY_SYSTEM = `你是记账助手，把一条支出备注归到给定的分类之一。
只输出 JSON：{"category":"分类ID"}，不要输出其他文字。拿不准时选 "other"。`;

export function classifyPrompt(note: string, categories: readonly Category[]): string {
  return [`备注：${note}`, "可选分类（ID：名称）：", ...categories.map(c => `- ${c.id}：${c.name}`)].join("\n");
}

export function parseClassify(text: string, categories: readonly Category[]): string | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const value: unknown = JSON.parse(match[0]);
    const id = value && typeof value === "object" && "category" in value ? (value as { category: unknown }).category : null;
    return typeof id === "string" && categories.some(c => c.id === id) ? id : null;
  } catch {
    return null;
  }
}
