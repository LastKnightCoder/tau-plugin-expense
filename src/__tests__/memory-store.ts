/**
 * 测试用的内存 records + storage：按 SDK 文档的语义实现筛选、排序、分页与 revision 校验。
 */
import {
  PluginConflictError,
  type JsonValue,
  type PluginFieldCondition,
  type PluginIndexes,
  type PluginOrderBy,
  type PluginRecord,
  type PluginRecordData,
  type PluginRecordQuery,
} from "@tau/plugins";
import type { ExpenseStore } from "../data/store";

interface Row {
  id: string;
  collection: string;
  data: PluginRecordData;
  createdAt: number;
  updatedAt: number;
  revision: number;
}

const clone = <T>(value: T): T => structuredClone(value);

function matches(value: JsonValue | undefined, condition: PluginFieldCondition): boolean {
  const actual = value === undefined ? null : value;
  if (condition === null || typeof condition !== "object") return actual === condition;
  const ops = condition;
  if (ops.eq !== undefined && actual !== ops.eq) return false;
  if (ops.ne !== undefined && actual === ops.ne) return false;
  if (ops.in !== undefined && !ops.in.includes(actual as never)) return false;
  const comparable = typeof actual === "number" || typeof actual === "string";
  if (ops.gt !== undefined && !(comparable && actual > ops.gt)) return false;
  if (ops.gte !== undefined && !(comparable && actual >= ops.gte)) return false;
  if (ops.lt !== undefined && !(comparable && actual < ops.lt)) return false;
  if (ops.lte !== undefined && !(comparable && actual <= ops.lte)) return false;
  return true;
}

export function createMemoryStore() {
  const rows = new Map<string, Row>();
  const collections = new Map<string, PluginIndexes>();
  const kv = new Map<string, JsonValue>();
  let nextId = 1;
  let clock = 1_000;
  const toRecord = (row: Row): PluginRecord => ({
    ...row,
    data: clone(row.data),
    revision: String(row.revision),
  });
  const indexesOf = (collection: string) => {
    const indexes = collections.get(collection);
    if (!indexes) throw new Error(`集合 ${collection} 未声明`);
    return indexes;
  };
  const getRow = (collection: string, id: string, expected: string) => {
    const row = rows.get(id);
    if (!row || row.collection !== collection) throw new Error("记录不存在");
    if (String(row.revision) !== expected) throw new PluginConflictError();
    return row;
  };

  const store: ExpenseStore & { rows: Map<string, Row> } = {
    rows,
    records: {
      registerCollection(definition) {
        collections.set(definition.name, definition.indexes ?? {});
        return { dispose: () => void collections.delete(definition.name) };
      },
      async insert(collection, data) {
        indexesOf(collection);
        const row: Row = {
          id: String(nextId++),
          collection,
          data: clone(data),
          createdAt: ++clock,
          updatedAt: clock,
          revision: 1,
        };
        rows.set(row.id, row);
        return toRecord(row);
      },
      async get(collection, id) {
        const row = rows.get(id);
        return row && row.collection === collection ? toRecord(row) : null;
      },
      async query(collection, options: PluginRecordQuery = {}) {
        const indexes = indexesOf(collection);
        for (const field of Object.keys(options.where ?? {}))
          if (!Object.hasOwn(indexes, field)) throw new Error(`字段 ${field} 未声明为索引`);
        const orders: PluginOrderBy[] = options.orderBy
          ? Array.isArray(options.orderBy)
            ? options.orderBy
            : [options.orderBy]
          : [{ field: "createdAt" }];
        const read = (row: Row, field: string): JsonValue =>
          field === "createdAt" || field === "updatedAt" ? row[field] : (row.data[field] ?? null);
        const list = [...rows.values()]
          .filter(row => row.collection === collection)
          .filter(row =>
            Object.entries(options.where ?? {}).every(([field, condition]) =>
              matches(row.data[field], condition)
            )
          )
          .sort((a, b) => {
            for (const order of orders) {
              const x = read(a, order.field);
              const y = read(b, order.field);
              if (x === y) continue;
              const sign = order.direction === "desc" ? -1 : 1;
              if (x === null) return -sign;
              if (y === null) return sign;
              return (x < y ? -1 : 1) * sign;
            }
            return Number(a.id) - Number(b.id);
          });
        const offset = options.cursor ? Number(options.cursor) : 0;
        const limit = Math.min(options.limit ?? 50, 200);
        const items = list.slice(offset, offset + limit).map(toRecord);
        return offset + limit < list.length ? { items, cursor: String(offset + limit) } : { items };
      },
      async count(collection, filter = {}) {
        let total = 0;
        let cursor: string | undefined;
        do {
          const page = await store.records.query(collection, { ...filter, limit: 200, cursor });
          total += page.items.length;
          cursor = page.cursor;
        } while (cursor);
        return total;
      },
      async update(collection, id, data, options) {
        const row = getRow(collection, id, options.expectedRevision);
        row.data = clone(data);
        row.revision += 1;
        row.updatedAt = ++clock;
        return toRecord(row);
      },
      async delete(collection, id, options) {
        getRow(collection, id, options.expectedRevision);
        rows.delete(id);
      },
    },
    storage: {
      async get(key) {
        return kv.has(key) ? clone(kv.get(key)) : undefined;
      },
      async set(key, value) {
        kv.set(key, clone(value));
      },
      async delete(key) {
        kv.delete(key);
      },
    },
  };
  return store;
}
