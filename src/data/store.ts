/**
 * 读写层：流水存进插件记录（按日期、月份索引，按窗口分页读取），分类与固定支出存进私有存储，
 * 一句话里常写的词 → 分类的记忆也存进私有存储。
 */
import type { JsonValue, PluginContext, PluginRecord, PluginWhere } from "@tau/plugins";
import { aliasKey } from "./parse";
import {
  OTHER,
  addMonths,
  configToJson,
  daysInMonth,
  monthDay,
  monthOf,
  parseConfig,
  parseTx,
  type Config,
  type Tx,
  type TxInput,
} from "./model";

export const TX = "tx";
const CONFIG_KEY = "config";
const ALIAS_KEY = "aliases";
const POSTED_KEY = "recurringPosted";
const ALIAS_LIMIT = 500;
const PAGE = 200;

/** 测试用内存实现与宿主共用的最小接口 */
export type ExpenseStore = Pick<PluginContext, "records" | "storage">;

export function registerCollections(context: Pick<PluginContext, "records">) {
  context.records.registerCollection({
    name: TX,
    indexes: { date: "string", month: "string", category: "string", recurringId: "string" },
  });
}

const toData = (input: TxInput) => ({ ...input, month: monthOf(input.date) });

async function queryAll(store: ExpenseStore, where: PluginWhere) {
  const items: PluginRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.records.query(TX, {
      where,
      orderBy: { field: "date" },
      limit: PAGE,
      ...(cursor ? { cursor } : {}),
    });
    items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return items;
}

const byTime = (a: Tx, b: Tx) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time);

export type AliasMemory = Record<string, string>;

export function createExpenseData(store: ExpenseStore) {
  const data = {
    /** 闭区间的月份范围内的全部流水，按日期、时间升序 */
    async listMonths(from: string, to: string): Promise<Tx[]> {
      return (await queryAll(store, { month: { gte: from, lte: to } }))
        .map(parseTx)
        .filter((t): t is Tx => t !== null)
        .sort(byTime);
    },

    async addTx(input: TxInput): Promise<Tx> {
      const tx = parseTx(await store.records.insert(TX, toData(input)));
      if (!tx) throw new Error("记录格式无效");
      return tx;
    },

    async updateTx(tx: Tx, patch: Partial<TxInput>): Promise<void> {
      const { id, revision, ...rest } = tx;
      await store.records.update(TX, id, toData({ ...rest, ...patch }), { expectedRevision: revision });
    },

    async deleteTx(tx: Tx): Promise<void> {
      await store.records.delete(TX, tx.id, { expectedRevision: tx.revision });
    },

    async getConfig(): Promise<Config> {
      return parseConfig(await store.storage.get(CONFIG_KEY));
    },

    async saveConfig(config: Config): Promise<void> {
      await store.storage.set(CONFIG_KEY, configToJson(config));
    },

    /** 删掉分类时，它的流水改到「其他」 */
    async moveCategory(from: string, to: string = OTHER): Promise<number> {
      const items = (await queryAll(store, { category: from })).map(parseTx).filter((t): t is Tx => t !== null);
      for (const tx of items) await data.updateTx(tx, { category: to });
      return items.length;
    },

    /**
     * 补记固定支出：每条规则从 earliest（默认本月）起，到今天为止每月一笔。
     * 「已处理到哪个月」记在私有存储里，用户删掉或改到别的月份的那笔不会再补回来；
     * 两台设备同步前各记了一笔时，按 recurringId + 月份只保留最早的一笔。
     */
    async postRecurring(config: Config, today: string, earliest: string = monthOf(today)): Promise<number> {
      const month = monthOf(today);
      const records = (await queryAll(store, { month: { gte: earliest, lte: month } }))
        .map(record => ({ record, tx: parseTx(record) }))
        .filter((r): r is { record: PluginRecord; tx: Tx } => r.tx?.recurringId != null)
        .sort((a, b) => a.record.createdAt - b.record.createdAt);
      const posted = new Set<string>();
      for (const { tx } of records) {
        const key = `${tx.recurringId}|${monthOf(tx.date)}`;
        if (posted.has(key)) await data.deleteTx(tx);
        else posted.add(key);
      }
      if (!config.recurring.length) return 0;
      const ledger = await data.getPosted();
      let count = 0;
      for (const rule of config.recurring) {
        const start = ledger[rule.id] ? addMonths(ledger[rule.id], 1) : earliest;
        for (let m = start < earliest ? earliest : start; m <= month; m = addMonths(m, 1)) {
          const date = monthDay(m, Math.min(rule.day, daysInMonth(m)));
          if (date > today) break;
          if (!posted.has(`${rule.id}|${m}`)) {
            await data.addTx({ date, time: "00:00", cents: rule.cents, category: rule.category, note: rule.note, recurringId: rule.id });
            count++;
          }
          ledger[rule.id] = m;
        }
      }
      // 删掉的规则不再保留进度
      const kept = Object.fromEntries(config.recurring.filter(r => ledger[r.id]).map(r => [r.id, ledger[r.id]]));
      await store.storage.set(POSTED_KEY, kept);
      return count;
    },

    /** 规则 ID → 已处理到的月份 */
    async getPosted(): Promise<Record<string, string>> {
      const raw = await store.storage.get(POSTED_KEY);
      const out: Record<string, string> = {};
      if (raw && typeof raw === "object" && !Array.isArray(raw))
        for (const [key, value] of Object.entries(raw)) if (typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) out[key] = value;
      return out;
    },

    async getAliases(): Promise<AliasMemory> {
      const raw = await store.storage.get(ALIAS_KEY);
      const aliases: AliasMemory = {};
      if (raw && typeof raw === "object" && !Array.isArray(raw))
        for (const [key, value] of Object.entries(raw)) if (typeof value === "string" && value) aliases[key] = value;
      return aliases;
    },

    /** 记住这句备注对应的分类；超过上限时丢掉最早的 */
    async rememberAlias(note: string, category: string): Promise<void> {
      const key = aliasKey(note);
      if (!key) return;
      const aliases = await data.getAliases();
      if (aliases[key] === category) return;
      delete aliases[key];
      aliases[key] = category;
      const keys = Object.keys(aliases);
      for (const old of keys.slice(0, Math.max(0, keys.length - ALIAS_LIMIT))) delete aliases[old];
      await store.storage.set(ALIAS_KEY, aliases as JsonValue);
    },
  };
  return data;
}

export type ExpenseData = ReturnType<typeof createExpenseData>;
