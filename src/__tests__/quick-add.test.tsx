// @vitest-environment jsdom
import { act, type ButtonHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CATEGORIES, type Config } from "../data/model";
import { monthStat } from "../data/stats";
import { QuickAdd } from "../ui/QuickAdd";
import zhCN from "../locales/zh-CN.json";

const { addTx, invalidateQueries } = vi.hoisted(() => ({
  addTx: vi.fn(async (_input: unknown) => undefined),
  invalidateQueries: vi.fn(async () => undefined),
}));

// SDK 运行时由宿主提供：测试里给 useI18n 一个按简体词典直译的替身，defineI18n 用最小实现兜住词典求值
vi.mock("@tau/plugins", () => ({
  defineI18n: (config: { fallbackLocale: string; resources: Record<string, Record<string, string>> }) => ({
    ...config,
    ref: (key: string) => ({ kind: "i18n", key }),
  }),
  useI18n: () => ({
    locale: "zh-CN",
    t: (key: string) => (zhCN as Record<string, string>)[key] ?? key,
    resolve: (value: unknown) => String(value),
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock("../ui/queries", () => ({ useAliases: () => ({ data: {} }) }));
vi.mock("../runtime", () => ({
  EXPENSE_KEY: ["expense"],
  useRuntime: () => runtime,
}));
vi.mock("@tau/ui", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  IconButton: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Spinner: () => null,
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const config: Config = { categories: DEFAULT_CATEGORIES.map(c => ({ ...c })), recurring: [] };
const stat = monthStat("2026-10", [], config, "2026-10-31", []);
const runtime = {
  data: { addTx },
  ai: { classify: vi.fn() },
  context: { signal: new AbortController().signal },
};
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("一句话记账的提交时间", () => {
  it.each([
    ["午饭 牛肉面 28", new Date(2026, 9, 31, 17, 5), new Date(2026, 9, 31, 20, 28), "2026-10-31", "20:28", 2800, "food", "午饭 牛肉面"],
    ["午饭 牛肉面 28", new Date(2026, 9, 31, 23, 59), new Date(2026, 10, 1, 0, 1), "2026-11-01", "00:01", 2800, "food", "午饭 牛肉面"],
    ["昨天 打车 30", new Date(2026, 9, 31, 23, 59), new Date(2026, 10, 1, 0, 1), "2026-10-31", "12:00", 3000, "trans", "打车"],
  ])(
    "页面保持打开时，%s 按提交时的当前日期保存",
    async (text, openedAt, submittedAt, date, time, cents, category, note) => {
      vi.setSystemTime(openedAt);
      await act(async () => {
        root.render(<QuickAdd today="2026-10-31" config={config} stat={stat} />);
      });
      const input = container.querySelector<HTMLInputElement>('input[aria-label="一句话记一笔支出"]')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      // 模拟休眠或后台节流：推进系统时间，不触发页面的定时刷新。
      vi.setSystemTime(submittedAt);
      await act(async () => {
        container.querySelector<HTMLButtonElement>('button[aria-label="记下"]')!.click();
      });
      expect(addTx).toHaveBeenCalledWith({ date, time, cents, category, note, recurringId: null });
    }
  );
});
