/**
 * 记账本的数据形状与校验。日期一律用本地日期键 YYYY-MM-DD，月份键 YYYY-MM，时间 HH:MM；金额以「分」为整数存储。
 * 记录与存储里读到的数据可能来自旧版本或其他设备，读取后先经 parse* 校验，不合格的丢弃或换成默认值。
 */
import type { JsonValue, PluginRecord } from "@tau/plugins";

export interface Tx {
  id: string;
  revision: string;
  date: string;
  time: string;
  /** 金额（分），正数 */
  cents: number;
  category: string;
  note: string;
  /** 由固定支出自动记入时为规则 ID，同一规则同一月只记一笔 */
  recurringId: string | null;
}

export type TxInput = Omit<Tx, "id" | "revision">;

export interface Category {
  id: string;
  name: string;
  /** 图标名，对应 ui/bits.tsx 的 ICONS */
  icon: string;
  /** 月预算（分），0 表示不设 */
  budget: number;
  /** 分类色序号，对应 CATEGORY_COLORS；新建分类取下一个空位 */
  color: number;
}

export interface Recurring {
  id: string;
  note: string;
  cents: number;
  category: string;
  /** 每月几号入账，1–28（避开月末长短不一） */
  day: number;
}

export interface Config {
  categories: Category[];
  recurring: Recurring[];
}

export const DEFAULT_CATEGORIES: readonly Category[] = [
  { id: "food", icon: "food", name: "餐饮", budget: 300000, color: 0 },
  { id: "shop", icon: "shop", name: "购物", budget: 150000, color: 1 },
  { id: "trans", icon: "trans", name: "交通", budget: 45000, color: 2 },
  { id: "fun", icon: "fun", name: "娱乐", budget: 80000, color: 3 },
  { id: "home", icon: "home", name: "居住", budget: 390000, color: 4 },
  { id: "social", icon: "social", name: "人情", budget: 60000, color: 5 },
  { id: "other", icon: "other", name: "其他", budget: 20000, color: 6 },
];

export const OTHER = "other";
export const MAX_CATEGORIES = 12;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

const isObject = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isCents = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1e11;

export function parseTx(record: PluginRecord): Tx | null {
  const { date, time, cents, category, note, recurringId } = record.data;
  if (typeof date !== "string" || !DATE_RE.test(date)) return null;
  if (!isCents(cents) || cents === 0) return null;
  if (typeof category !== "string" || !category) return null;
  return {
    id: record.id,
    revision: record.revision,
    date,
    time: typeof time === "string" && TIME_RE.test(time) ? time : "00:00",
    cents,
    category,
    note: typeof note === "string" ? note.slice(0, 200) : "",
    recurringId: typeof recurringId === "string" && recurringId ? recurringId : null,
  };
}

function parseCategory(value: JsonValue): Category | null {
  if (!isObject(value)) return null;
  const { id, name, icon, budget, color } = value;
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  if (typeof name !== "string" || !name.trim()) return null;
  return {
    id,
    name: name.trim().slice(0, 12),
    icon: typeof icon === "string" && icon ? icon.slice(0, 32) : id,
    budget: isCents(budget) ? budget : 0,
    color: typeof color === "number" && Number.isInteger(color) && color >= 0 ? color : 0,
  };
}

function parseRecurring(value: JsonValue): Recurring | null {
  if (!isObject(value)) return null;
  const { id, note, cents, category, day } = value;
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  if (typeof note !== "string" || !note.trim()) return null;
  if (!isCents(cents) || cents === 0) return null;
  if (typeof category !== "string" || !category) return null;
  if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 28) return null;
  return { id, note: note.trim().slice(0, 40), cents, category, day };
}

/** 没有配置或配置损坏时用默认分类；「其他」分类始终存在，删掉分类的流水归到这里 */
export function parseConfig(value: JsonValue | undefined): Config {
  const raw = isObject(value) ? value : {};
  const seen = new Set<string>();
  const categories = (Array.isArray(raw.categories) ? raw.categories : [])
    .map(parseCategory)
    .filter((c): c is Category => c !== null && !seen.has(c.id) && (seen.add(c.id), true))
    .slice(0, MAX_CATEGORIES);
  const list = categories.length ? categories : DEFAULT_CATEGORIES.map(c => ({ ...c }));
  if (!list.some(c => c.id === OTHER)) list.push({ id: OTHER, icon: OTHER, name: "其他", budget: 0, color: nextColor(list) });
  const ids = new Set(list.map(c => c.id));
  const recurring = (Array.isArray(raw.recurring) ? raw.recurring : [])
    .map(parseRecurring)
    .filter((r): r is Recurring => r !== null)
    .map(r => (ids.has(r.category) ? r : { ...r, category: OTHER }));
  return { categories: list, recurring };
}

export const configToJson = (config: Config): JsonValue => ({
  categories: config.categories.map(c => ({ ...c })),
  recurring: config.recurring.map(r => ({ ...r })),
});

/** 未被占用的最小色序号 */
export function nextColor(categories: readonly Pick<Category, "color">[]): number {
  const used = new Set(categories.map(c => c.color));
  let k = 0;
  while (used.has(k)) k++;
  return k;
}

export const totalBudget = (config: Config) => config.categories.reduce((s, c) => s + c.budget, 0);

/* ---------- 日期 ---------- */

const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const timeKey = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
export const monthOf = (date: string) => date.slice(0, 7);
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
/** 两个日期键相差的天数（b − a） */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86_400_000);
}
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}
export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
export const monthDay = (month: string, day: number) => `${month}-${pad(day)}`;
/** 周一 = 0 … 周日 = 6 */
export const weekdayIndex = (date: string) => (parseDateKey(date).getDay() + 6) % 7;

/* ---------- 金额 ---------- */

/** 「28」「28.5」「¥1,299」→ 分；无法识别返回 null */
export function parseYuan(text: string): number | null {
  const cleaned = text.replace(/[¥￥,，\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 && cents <= 1e11 ? cents : null;
}

/** 分 → 「1,299」或「28.50」（有角分时才带小数） */
export function formatYuan(cents: number, { always = false }: { always?: boolean } = {}): string {
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const rest = abs % 100;
  const head = yuan.toLocaleString("en-US");
  const body = rest || always ? `${head}.${pad(rest)}` : head;
  return cents < 0 ? `−${body}` : body;
}
