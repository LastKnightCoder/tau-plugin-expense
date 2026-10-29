import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES, formatYuan, parseConfig, parseYuan, type Config, type Tx } from "../data/model";
import { parseClassify, parseLine } from "../data/parse";
import { createExpenseData, registerCollections } from "../data/store";
import { dailyRoom, monthStat, monthTotals, paceStatus, samePeriodTotal, weekdayAverages } from "../data/stats";
import { createMemoryStore } from "./memory-store";

const cats = DEFAULT_CATEGORIES.map(c => ({ ...c }));

function setup() {
  const store = createMemoryStore();
  registerCollections(store);
  return { store, data: createExpenseData(store) };
}

let seq = 0;
const tx = (date: string, yuan: number, category = "food", extra: Partial<Tx> = {}): Tx => ({
  id: String(++seq),
  revision: "1",
  date,
  time: "12:00",
  cents: Math.round(yuan * 100),
  category,
  note: "",
  recurringId: null,
  ...extra,
});

describe("金额", () => {
  it("识别元、角分与千分位，拒绝零和非数字", () => {
    expect(parseYuan("28")).toBe(2800);
    expect(parseYuan("28.5")).toBe(2850);
    expect(parseYuan("¥1,299")).toBe(129900);
    expect(parseYuan("0")).toBeNull();
    expect(parseYuan("abc")).toBeNull();
    expect(parseYuan("1.234")).toBeNull();
  });

  it("整元不带小数，有角分时补齐两位", () => {
    expect(formatYuan(129900)).toBe("1,299");
    expect(formatYuan(2850)).toBe("28.50");
    expect(formatYuan(-500)).toBe("−5");
  });
});

describe("一句话解析", () => {
  it("取最后一个数字作金额，其余作备注，按关键词归类", () => {
    expect(parseLine("午饭 牛肉面 28", cats, {})).toEqual({ dayOffset: 0, note: "午饭 牛肉面", cents: 2800, category: "food", source: "keyword" });
    expect(parseLine("2 杯咖啡 36元", cats, {})).toMatchObject({ note: "2 杯咖啡", cents: 3600, category: "food" });
    expect(parseLine("打车回家 36.5", cats, {})).toMatchObject({ cents: 3650, category: "trans" });
  });

  it("记过的备注优先于关键词，认不出时分类为空", () => {
    expect(parseLine("瑞幸 16", cats, { 瑞幸: "fun" })).toMatchObject({ category: "fun", source: "alias" });
    expect(parseLine("给猫买了猫砂 45", cats, {})).toMatchObject({ category: "shop" });
    expect(parseLine("修车 300", cats, {})).toMatchObject({ category: null, source: null });
  });

  it("没写金额时金额为空，备注直接写分类名时用该分类", () => {
    expect(parseLine("奶茶", cats, {})).toMatchObject({ cents: null, category: "food" });
    expect(parseLine("人情 600", cats, {})).toMatchObject({ note: "人情", category: "social" });
  });

  it("认千分位，小数超过两位时整段不当金额", () => {
    expect(parseLine("淘宝 1,299", cats, {})).toMatchObject({ note: "淘宝", cents: 129900 });
    expect(parseLine("￥1,299 耳机", cats, {})).toMatchObject({ note: "耳机", cents: 129900 });
    expect(parseLine("午饭 3.555", cats, {})).toMatchObject({ cents: null });
    expect(parseLine("1，000 份子钱", cats, {})).toMatchObject({ cents: 100000, category: "social" });
  });

  it("开头写昨天、前天时记到那天", () => {
    expect(parseLine("昨天 打车 30", cats, {})).toMatchObject({ dayOffset: -1, note: "打车", cents: 3000 });
    expect(parseLine("前天电影 45", cats, {})).toMatchObject({ dayOffset: -2, note: "电影", category: "fun" });
    expect(parseLine("昨天", cats, {})).toBeNull();
  });

  it("AI 归类只接受已有分类", () => {
    expect(parseClassify('好的 {"category":"trans"}', cats)).toBe("trans");
    expect(parseClassify('{"category":"car"}', cats)).toBeNull();
    expect(parseClassify("不知道", cats)).toBeNull();
  });
});

describe("配置", () => {
  it("没有配置时用默认分类，损坏的条目丢弃，「其他」始终存在", () => {
    expect(parseConfig(undefined).categories.map(c => c.id)).toEqual(DEFAULT_CATEGORIES.map(c => c.id));
    const config = parseConfig({
      categories: [{ id: "food", name: "吃", budget: 100, color: 0 }, { id: "BAD ID", name: "x" }, { id: "food", name: "重复" }],
      recurring: [{ id: "rent", note: "房租", cents: 350000, category: "gone", day: 1 }, { id: "x", note: "坏", cents: 1, category: "food", day: 31 }],
    });
    expect(config.categories.map(c => c.id)).toEqual(["food", "other"]);
    expect(config.recurring).toEqual([{ id: "rent", note: "房租", cents: 350000, category: "other", day: 1 }]);
  });
});

describe("存储", () => {
  it("按月份范围读取，增改删带 revision", async () => {
    const { data } = setup();
    const a = await data.addTx({ date: "2026-10-01", time: "08:00", cents: 1600, category: "food", note: "咖啡", recurringId: null });
    await data.addTx({ date: "2026-09-30", time: "08:00", cents: 900, category: "food", note: "包子", recurringId: null });
    expect((await data.listMonths("2026-10", "2026-10")).map(t => t.note)).toEqual(["咖啡"]);
    await data.updateTx(a, { date: "2026-09-29" });
    expect((await data.listMonths("2026-09", "2026-09")).map(t => t.date)).toEqual(["2026-09-29", "2026-09-30"]);
    await expect(data.updateTx(a, { note: "旧版本" })).rejects.toThrow();
  });

  it("固定支出每月只补记一次，入账日之前不记", async () => {
    const { data } = setup();
    const config: Config = { categories: cats, recurring: [{ id: "rent", note: "房租", cents: 350000, category: "home", day: 1 }, { id: "tv", note: "会员", cents: 2500, category: "fun", day: 12 }] };
    expect(await data.postRecurring(config, "2026-10-05", "2026-09")).toBe(3);
    expect(await data.postRecurring(config, "2026-10-05", "2026-09")).toBe(0);
    expect(await data.postRecurring(config, "2026-10-12", "2026-10")).toBe(1);
    const list = await data.listMonths("2026-09", "2026-10");
    expect(list.map(t => `${t.date} ${t.note}`)).toEqual(["2026-09-01 房租", "2026-09-12 会员", "2026-10-01 房租", "2026-10-12 会员"]);
    expect(list.every(t => t.recurringId)).toBe(true);
  });

  it("删掉或改到别的月份的固定支出不会被补回来", async () => {
    const { data } = setup();
    const config: Config = { categories: cats, recurring: [{ id: "rent", note: "房租", cents: 350000, category: "home", day: 1 }] };
    await data.postRecurring(config, "2026-10-05");
    const [rent] = await data.listMonths("2026-10", "2026-10");
    await data.deleteTx(rent);
    expect(await data.postRecurring(config, "2026-10-20")).toBe(0);
    expect(await data.listMonths("2026-10", "2026-10")).toEqual([]);
    expect(await data.postRecurring(config, "2026-11-01")).toBe(1);
  });

  it("两台设备同步前各记了一笔时只保留最早的", async () => {
    const { data } = setup();
    const input = { date: "2026-10-01", time: "00:00", cents: 350000, category: "home", note: "房租", recurringId: "rent" };
    await data.addTx(input);
    await data.addTx(input);
    await data.postRecurring({ categories: cats, recurring: [] }, "2026-10-05");
    expect(await data.listMonths("2026-10", "2026-10")).toHaveLength(1);
  });

  it("删分类时流水移到「其他」，记住备注对应的分类", async () => {
    const { data } = setup();
    await data.addTx({ date: "2026-10-01", time: "08:00", cents: 1600, category: "fun", note: "电影", recurringId: null });
    expect(await data.moveCategory("fun")).toBe(1);
    expect((await data.listMonths("2026-10", "2026-10"))[0].category).toBe("other");
    await data.rememberAlias(" 瑞幸 ", "food");
    expect(await data.getAliases()).toEqual({ 瑞幸: "food" });
  });
});

describe("统计", () => {
  const config: Config = { categories: cats, recurring: [] };

  it("时间进度今天按半天算，偏快 = 超过进度 10 个百分点", () => {
    expect(paceStatus(500, 1000, 0.5)).toBe("ok");
    expect(paceStatus(610, 1000, 0.5)).toBe("fast");
    expect(paceStatus(1001, 1000, 0.5)).toBe("over");
    expect(paceStatus(100, 0, 0.5)).toBe("ok");
    const s = monthStat("2026-10", [], config, "2026-10-29", []);
    expect(s.elapsed).toBe(28.5);
    expect(s.daysLeft).toBe(3);
    expect(monthStat("2026-09", [], config, "2026-10-29", []).pace).toBe(1);
  });

  it("固定支出不进日历和日均额度，只算进总额", () => {
    const list = [tx("2026-10-01", 3500, "home", { recurringId: "rent" }), tx("2026-10-01", 30), tx("2026-10-02", 20, "trans")];
    const s = monthStat("2026-10", list, config, "2026-10-29", []);
    expect(s.total).toBe(355000);
    expect(s.fixed).toBe(350000);
    expect(s.calendar[0]).toMatchObject({ flex: 3000, fixed: 350000 });
    expect(s.allowance).toBeCloseTo((s.budget - 350000) / 31);
    expect(s.categories.find(c => c.id === "home")).toMatchObject({ fixedOnly: true, status: "ok" });
  });

  it("月初记入的房租不让总进度和分类误报偏快", () => {
    const withRent: Config = { categories: cats, recurring: [{ id: "rent", note: "房租", cents: 300000, category: "home", day: 1 }] };
    const list = [tx("2026-10-01", 3000, "home", { recurringId: "rent" }), tx("2026-10-02", 10, "home")];
    const s = monthStat("2026-10", list, withRent, "2026-10-02", []);
    expect(s.paceRatio).toBeLessThan(s.pace);
    expect(s.categories.find(c => c.id === "home")?.status).toBe("ok");
  });

  it("还没到入账日的固定支出提前从日均额度和每天可花里扣掉", () => {
    const later: Config = { categories: cats, recurring: [{ id: "rent", note: "房租", cents: 300000, category: "home", day: 15 }] };
    const before = monthStat("2026-10", [], later, "2026-10-10", []);
    const after = monthStat("2026-10", [tx("2026-10-15", 3000, "home", { recurringId: "rent" })], later, "2026-10-15", []);
    expect(before.allowance).toBeCloseTo(after.allowance);
    expect(before.fixedPlanned).toBe(300000);
    expect(dailyRoom(before)).toBeCloseTo((before.budget - 300000) / before.daysLeft);
  });

  it("对比基准取之前最多 3 个有流水的月份", () => {
    const list = [tx("2026-06-10", 900), tx("2026-07-10", 300), tx("2026-08-10", 600), tx("2026-09-10", 900), tx("2026-10-10", 100)];
    const totals = monthTotals(list, ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(monthStat("2026-10", list, config, "2026-10-29", totals).categories[0].average).toBe(60000);
    expect(monthStat("2026-06", list, config, "2026-10-29", totals).categories[0].average).toBeNull();
  });

  it("上月同期截到同一天，周几分布只算可控支出", () => {
    const list = [tx("2026-09-05", 10), tx("2026-09-29", 20), tx("2026-09-30", 40), tx("2026-10-26", 70), tx("2026-10-27", 99, "home", { recurringId: "r" })];
    expect(samePeriodTotal(list, "2026-10-29")).toEqual({ month: "2026-09", total: 3000 });
    const w = weekdayAverages(list, "2026-10-19", "2026-11-01");
    // 从第一笔（10/26 周一）算起，之前的空白周不计
    expect(w.mean[0]).toBe(7000);
    expect(w.mean[1]).toBe(0);
    expect(w.days).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});
