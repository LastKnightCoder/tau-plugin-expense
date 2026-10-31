/**
 * 语音记账：识别出的一段口语拆成几笔。配了模型时交给 AI 拆句、归类并给一句提醒；
 * 没配模型或 AI 失败时本地按「，。然后」拆句，中文数字转成阿拉伯数字后走一句话记账的解析。
 */
import { OTHER, parseYuan, type Category } from "./model";
import { parseLine, type Draft } from "./parse";

export interface VoiceItem {
  note: string;
  /** 没听到金额时为 null，记下前要补上 */
  cents: number | null;
  category: string;
  /** 0 = 今天，-1 = 昨天，-2 = 前天 */
  dayOffset: number;
  /** 分类从哪来：AI、用户点选、记过的备注、关键词；本地认不出时为 null（先归到「其他」） */
  source: "ai" | "picked" | Draft["source"];
}

export interface Organized {
  items: VoiceItem[];
  advice: string;
}

const DIGITS: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

/** 「二十八」→ 28，「三百二」→ 320（口语省略末位单位），「一百零五」→ 105，「十二点五」→ 12.5 */
export function chineseToNumber(text: string): number | null {
  const [intPart, decPart] = text.split("点");
  let total = 0;
  let section = 0;
  let num = 0;
  let lastUnit = 0;
  let zero = false;
  let plain = "";
  for (const ch of intPart) {
    if (ch in DIGITS) {
      num = DIGITS[ch];
      if (num === 0) zero = true;
      plain += String(num);
    } else if (ch in UNITS) {
      const unit = UNITS[ch];
      section += (num || (unit === 10 && !section && !total ? 1 : 0)) * unit;
      num = 0;
      lastUnit = unit;
      zero = false;
      plain = "";
    } else if (ch === "万") {
      total += (section + num) * 10000;
      section = 0;
      num = 0;
      lastUnit = 10000;
      zero = false;
      plain = "";
    } else return null;
  }
  let value: number;
  if (!lastUnit) {
    if (!plain) return null;
    value = Number(plain);
  } else value = total + section + (zero || lastUnit === 10 ? num : (num * lastUnit) / 10);
  if (decPart != null) {
    let decimals = "";
    for (const ch of decPart) {
      if (!(ch in DIGITS)) return null;
      decimals += String(DIGITS[ch]);
    }
    if (decimals) value += Number(`0.${decimals}`);
  }
  return value;
}

const RUN = "[零〇一二两三四五六七八九十百千万点]+";
const ONE = "[零〇一二两三四五六七八九\\d]";
const BOUNDARY = "(?=$|[，,。；;、\\s])";
// 「两块五一斤」：角后面紧跟「数量 + 量词」
const PER_UNIT = "(?=[一二两三四五六七八九\\d]\\s*(?:斤|公斤|个|杯|份|碗|瓶|袋|盒|只|件|张|根|包))";
/**
 * 「八块八毛八」「一块二毛五」「二十块零五毛」「三块五」「两块五」→ X.YZ元。
 * 「块」后的单个数字只有跟着「毛 / 角」、就在句末标点前、或后面还有「数量 + 量词」时才是角，「十五块一斤」里的「一」是量词。
 */
const YUAN_JIAO = new RegExp(
  `(${RUN}|\\d+)\\s*[块元]\\s*(?:零)?(?:(${ONE})\\s*[毛角](?:\\s*(${ONE})(?:\\s*分|${BOUNDARY}))?|(${ONE})(?:${BOUNDARY}|${PER_UNIT})|(${ONE})\\s*分)`,
  "g"
);
const MONEY = new RegExp(RUN, "g");

const toArabic = (run: string) => (/^\d+$/.test(run) ? Number(run) : chineseToNumber(run));
const digitOf = (ch: string | undefined) => (ch == null ? 0 : /\d/.test(ch) ? Number(ch) : DIGITS[ch]);

/**
 * 句子里的中文数字转成阿拉伯数字。只转像金额的：带「十百千万点」的、后面跟「块 / 元」或在句末的；
 * 「一碗」「两个」这类量词前的单个数字保留，避免被当成金额。
 */
export function normalizeNumbers(text: string): string {
  const jiao = text.replace(YUAN_JIAO, (all, head: string, jiaoA?: string, fen?: string, jiaoB?: string, fenOnly?: string) => {
    const yuan = toArabic(head);
    if (yuan == null) return all;
    const j = digitOf(jiaoA ?? jiaoB);
    const f = digitOf(fen ?? fenOnly);
    return `${yuan}.${j}${f}元`;
  });
  return jiao.replace(MONEY, (run, offset: number, whole: string) => {
    // 「十二点」是时刻，不是金额
    if (run.endsWith("点")) return run;
    const after = whole.slice(offset + run.length);
    const moneyLike = /[十百千万点]/.test(run) || /^\s*(块|元|钱|$|[，,。；;、])/.test(after);
    if (!moneyLike) return run;
    const value = chineseToNumber(run);
    return value == null ? run : String(value);
  });
}

const LEAD = /^(然后|还有|另外|再)?(我)?(今天|今日|昨天|昨日|前天|刚才|刚刚)?(早上|上午|中午|下午|晚上|夜里)?(又)?/;

/**
 * 没有 AI 时的退路：按句拆开，各自本地解析；空句与只有时间词的句子丢掉。
 * 「昨天午饭三十，打车二十」里后一句沿用前一句的日子，直到哪句说了「今天 / 昨天 / 前天」。
 */
export function splitSpeech(speech: string, categories: readonly Category[], aliases: Record<string, string>): VoiceItem[] {
  let day = 0;
  return normalizeNumbers(speech)
    .split(/[，,。；;、\n]|然后|还有|另外/)
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, 12)
    .flatMap(raw => {
      const head = raw.replace(/^(然后|还有|另外|再)?(我)?/, "");
      if (/^(今天|今日)/.test(head)) day = 0;
      const said = head.match(/^(昨天|昨日|前天)/);
      const part = head.replace(LEAD, "").trim();
      const draft = parseLine(said ? `${said[1]} ${part.replace(/^(昨天|昨日|前天)\s*/, "")}` : part, categories, aliases);
      if (!draft || !draft.note) return [];
      if (said) day = draft.dayOffset;
      return [{ note: draft.note.slice(0, 40), cents: draft.cents, category: draft.category ?? OTHER, dayOffset: said ? draft.dayOffset : day, source: draft.source }];
    });
}

export const ORGANIZE_SYSTEM = `你是用户的记账助手。用户会用中文口语说一段花了哪些钱。
把它拆成若干笔支出，只输出一个 JSON 对象，不要任何其他文字：
{"items":[{"note":"简短备注","yuan":数字|null,"category":"分类ID","day":0|-1|-2}],"advice":"提醒"}
- 每样花费一笔，最多 12 笔；金额是用户说的数，中文数字换成阿拉伯数字（「三百二」是 320，「三块五」是 3.5），没说金额时为 null，不要猜。
- category 只能从给出的分类 ID 里选，拿不准选 "other"。
- day：说了「昨天」为 -1、「前天」为 -2，否则为 0。
- note 保留用户说法，去掉语气词、时间词和金额，不超过 20 个字。
- advice：结合给出的本月数据，用一两句话说记下这些后本月还能花多少、哪类要注意；不超过 80 字，语气平实，不用 Markdown。`;

export interface OrganizeContext {
  /** 记下之前本月还能花多少（分）；没设预算时为 null */
  left: number | null;
  daysLeft: number;
  /** 已超或偏快的分类名称 */
  tight: string[];
}

export function organizePrompt(speech: string, categories: readonly Category[], ctx: OrganizeContext): string {
  return [
    "可选分类（ID：名称）：",
    ...categories.map(c => `- ${c.id}：${c.name}`),
    ctx.left == null ? "本月没设预算" : `记下之前本月还能花 ${Math.round(ctx.left / 100)} 元，还剩 ${ctx.daysLeft} 天`,
    ctx.tight.length ? `已超或花得偏快的分类：${ctx.tight.join("、")}` : "",
    `用户说：${speech}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseOrganized(reply: string, categories: readonly Category[]): Organized | null {
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let value: unknown;
  try {
    value = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { items, advice } = value as Record<string, unknown>;
  if (!Array.isArray(items)) return null;
  const ids = new Set(categories.map(c => c.id));
  const parsed: VoiceItem[] = [];
  for (const raw of items.slice(0, 12)) {
    if (typeof raw !== "object" || raw === null) continue;
    const { note, yuan, category, day } = raw as Record<string, unknown>;
    if (typeof note !== "string" || !note.trim()) continue;
    const cents = typeof yuan === "number" && Number.isFinite(yuan) ? parseYuan(String(Math.round(yuan * 100) / 100)) : null;
    parsed.push({
      note: note.trim().slice(0, 40),
      cents,
      category: typeof category === "string" && ids.has(category) ? category : OTHER,
      dayOffset: day === -1 || day === -2 ? day : 0,
      source: "ai",
    });
  }
  if (!parsed.length) return null;
  return { items: parsed, advice: typeof advice === "string" ? advice.trim().slice(0, 200) : "" };
}
