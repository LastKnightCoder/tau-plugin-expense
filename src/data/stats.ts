/**
 * 统计口径（纯函数，页面、首页卡片和 AI 共用）：
 * - 固定支出 = 由固定支出规则自动记入的流水；可控支出 = 其余流水。日历、日均、周几分布只看可控支出。
 * - 时间进度 = 已过天数 / 当月天数，今天按半天算，避免中午就判「偏快」；看历史月份时为 1。
 * - 固定支出不随时间均匀发生，判断快慢时先从预算里扣掉：本月固定额 = max(已记入的, 规则合计)，
 *   还没到入账日的也提前扣，避免月中数字跳变。
 * - 分类「偏快」= 可控支出占（分类预算 − 该类固定支出）的比例超过时间进度 10 个百分点；「已超」= 总额超出预算。
 * - 日均额度 = （月预算 − 本月固定额）/ 当月天数，作为日历格子的满格基准。
 * - 对比基准 = 该月之前 3 个月的平均（不足 3 个月按已有的月份平均，没有则为 null）。
 */
import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  monthDay,
  monthOf,
  totalBudget,
  weekdayIndex,
  type Config,
  type Tx,
} from "./model";

export type Pace = "ok" | "fast" | "over";

export interface CategoryStat {
  id: string;
  spent: number;
  budget: number;
  /** 前 3 个月平均，没有历史为 null */
  average: number | null;
  status: Pace;
  /** 本月这一类全是固定支出 */
  fixedOnly: boolean;
}

export interface DayStat {
  date: string;
  /** 可控支出合计 */
  flex: number;
  fixed: number;
  byCategory: Record<string, number>;
  /** 可控支出里金额最大的一笔 */
  top: Tx | null;
  future: boolean;
}

export interface MonthStat {
  month: string;
  days: number;
  /** 截至今天（历史月份为整月）已过的天数，含今天半天 */
  elapsed: number;
  pace: number;
  total: number;
  fixed: number;
  flex: number;
  budget: number;
  allowance: number;
  categories: CategoryStat[];
  calendar: DayStat[];
  /** 本月固定额：已记入的固定支出与规则合计取大 */
  fixedPlanned: number;
  /** 可控支出 / 可控预算，与 pace 比较判断快慢；没有可控预算时为 0 */
  paceRatio: number;
  /** 剩余天数（含今天）；历史月份为 0 */
  daysLeft: number;
  live: boolean;
}

export interface MonthTotal {
  month: string;
  total: number;
  byCategory: Record<string, number>;
}

const sum = (list: readonly Tx[]) => list.reduce((s, t) => s + t.cents, 0);
export const isFixed = (tx: Tx) => tx.recurringId != null;

export function byCategory(list: readonly Tx[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of list) out[t.category] = (out[t.category] ?? 0) + t.cents;
  return out;
}

/** fixed 为这部分预算里的固定支出，不参与快慢比较 */
export function paceStatus(spent: number, budget: number, pace: number, fixed = 0): Pace {
  if (budget <= 0) return "ok";
  if (spent > budget) return "over";
  const room = budget - fixed;
  if (room <= 0) return "ok";
  return (spent - fixed) / room > pace + 0.1 ? "fast" : "ok";
}

export function monthTotals(txs: readonly Tx[], months: readonly string[]): MonthTotal[] {
  return months.map(month => {
    const list = txs.filter(t => monthOf(t.date) === month);
    return { month, total: sum(list), byCategory: byCategory(list) };
  });
}

/** 某月之前最多 3 个有流水的月份；用来求「平时」 */
export function baseline(totals: readonly MonthTotal[], month: string): MonthTotal[] {
  return totals.filter(m => m.month < month && m.total > 0).slice(-3);
}

export function monthStat(month: string, txs: readonly Tx[], config: Config, today: string, history: readonly MonthTotal[]): MonthStat {
  const list = txs.filter(t => monthOf(t.date) === month);
  const days = daysInMonth(month);
  const live = month === monthOf(today);
  const future = month > monthOf(today);
  const elapsed = future ? 0 : live ? daysBetween(monthDay(month, 1), today) + 0.5 : days;
  const fixedList = list.filter(isFixed);
  const flexList = list.filter(t => !isFixed(t));
  const budget = totalBudget(config);
  const fixed = sum(fixedList);
  const base = baseline(history, month);
  const spentBy = byCategory(list);
  const fixedBy = byCategory(fixedList);
  const pace = Math.min(1, elapsed / days);
  // 规则按分类的计划额；历史月份规则可能已变，只看已记入的
  const ruleBy: Record<string, number> = {};
  if (live) for (const r of config.recurring) ruleBy[r.category] = (ruleBy[r.category] ?? 0) + r.cents;
  const plannedOf = (id: string) => Math.max(fixedBy[id] ?? 0, ruleBy[id] ?? 0);
  const fixedPlanned = Math.max(fixed, Object.values(ruleBy).reduce((a, b) => a + b, 0));

  const categories = config.categories.map(c => {
    const spent = spentBy[c.id] ?? 0;
    const fixedOnly = spent > 0 && (fixedBy[c.id] ?? 0) === spent;
    const planned = plannedOf(c.id);
    // 还没入账的固定支出也算进已用，判快慢时一并扣掉
    const committed = spent + planned - (fixedBy[c.id] ?? 0);
    return {
      id: c.id,
      spent,
      budget: c.budget,
      average: base.length ? base.reduce((s, m) => s + (m.byCategory[c.id] ?? 0), 0) / base.length : null,
      status: spent > c.budget && c.budget > 0 ? "over" : paceStatus(committed, c.budget, live ? pace : 1, planned),
      fixedOnly,
    } satisfies CategoryStat;
  });
  // 已删除分类的历史流水（正常会被挪到「其他」，这里兜底不丢钱）
  for (const [id, spent] of Object.entries(spentBy))
    if (!config.categories.some(c => c.id === id))
      categories.push({ id, spent, budget: 0, average: null, status: "ok", fixedOnly: false });

  const calendar: DayStat[] = [];
  for (let d = 1; d <= days; d++) {
    const date = monthDay(month, d);
    const dayList = list.filter(t => t.date === date);
    const flex = dayList.filter(t => !isFixed(t));
    calendar.push({
      date,
      flex: sum(flex),
      fixed: sum(dayList.filter(isFixed)),
      byCategory: byCategory(flex),
      top: flex.reduce<Tx | null>((best, t) => (!best || t.cents > best.cents ? t : best), null),
      future: date > today,
    });
  }

  return {
    month,
    days,
    elapsed,
    pace,
    total: sum(list),
    fixed,
    flex: sum(flexList),
    budget,
    fixedPlanned,
    paceRatio: budget - fixedPlanned > 0 ? sum(flexList) / (budget - fixedPlanned) : 0,
    allowance: Math.max(0, (budget - fixedPlanned) / days),
    categories,
    calendar,
    daysLeft: live ? days - Math.floor(elapsed) : 0,
    live,
  };
}

/** 剩下每天最多能花多少：月预算 − 已花 − 还没入账的固定支出，平均到剩余天数 */
export function dailyRoom(stat: MonthStat): number {
  if (stat.daysLeft <= 0 || stat.budget <= 0) return 0;
  const pending = Math.max(0, stat.fixedPlanned - stat.fixed);
  return Math.max(0, stat.budget - stat.total - pending) / stat.daysLeft;
}

/** 截至同一天的上月支出（「比上月同期」）；上月较短时取到月末 */
export function samePeriodTotal(txs: readonly Tx[], today: string): { month: string; total: number } {
  const month = addMonths(monthOf(today), -1);
  const day = Math.min(Number(today.slice(8, 10)), daysInMonth(month));
  const end = monthDay(month, day);
  return { month, total: sum(txs.filter(t => monthOf(t.date) === month && t.date <= end)) };
}

/** 周一到周日的日均可控支出；从窗口内第一笔流水算起（刚开始记账时不被空白天拉低），没有那一天的样本时为 null */
export function weekdayAverages(txs: readonly Tx[], from: string, to: string): { mean: (number | null)[]; days: number[] } {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const flexByDate = new Map<string, number>();
  for (const t of txs) if (!isFixed(t) && t.date >= from && t.date <= to) flexByDate.set(t.date, (flexByDate.get(t.date) ?? 0) + t.cents);
  const start = [...flexByDate.keys()].sort()[0];
  if (!start) return { mean: totals.map(() => null), days: counts };
  for (let i = 0, n = daysBetween(start, to); i <= n; i++) {
    const date = addDays(start, i);
    const w = weekdayIndex(date);
    totals[w] += flexByDate.get(date) ?? 0;
    counts[w]++;
  }
  return { mean: totals.map((v, i) => (counts[i] ? v / counts[i] : null)), days: counts };
}

/** 同一分类下按备注聚合（「正餐」「咖啡」这类子项），金额降序 */
export function topNotes(list: readonly Tx[], limit = 5): { note: string; cents: number; count: number }[] {
  const map = new Map<string, { note: string; cents: number; count: number }>();
  for (const t of list) {
    const key = t.note || "（无备注）";
    const item = map.get(key) ?? { note: key, cents: 0, count: 0 };
    item.cents += t.cents;
    item.count++;
    map.set(key, item);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents).slice(0, limit);
}
