/**
 * 插件运行时：本次启用的 context、数据层、AI 与查询缓存；组件经 useRuntime 取得。
 * 本插件的记录变化（含同步下载、其他窗口写入）时整体刷新。
 */
import { createContext, useContext, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PluginContext, PluginPageHandle, PluginSettingsHandle } from "@tau/plugins";
import { createAI, type ExpenseAI } from "./ai";
import { createExpenseData, type ExpenseData } from "./data/store";

export const EXPENSE_KEY = ["expense"] as const;

export interface ExpenseRuntime {
  context: PluginContext;
  data: ExpenseData;
  ai: ExpenseAI;
  queryClient: QueryClient;
  /** 手机另注册月历、分类、回顾与搜索几个二级页 */
  pages: {
    main?: PluginPageHandle;
    settings?: PluginSettingsHandle;
    calendar?: PluginPageHandle;
    categories?: PluginPageHandle;
    category?: PluginPageHandle;
    review?: PluginPageHandle;
    search?: PluginPageHandle;
  };
  /** 本次启用里最近一次补记固定支出：日期与规则的指纹，以及进行中或已完成的那次 */
  recurring: { mark: string; done: Promise<number> } | null;
}

export function createRuntime(context: PluginContext): ExpenseRuntime {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  context.events.on(["record.created", "record.updated", "record.deleted", "workspace.reset"], () => {
    void queryClient.invalidateQueries({ queryKey: EXPENSE_KEY });
  });
  context.register({ dispose: () => queryClient.clear() });
  return {
    context,
    data: createExpenseData(context),
    ai: createAI(context),
    queryClient,
    pages: {},
    recurring: null,
  };
}

const RuntimeContext = createContext<ExpenseRuntime | null>(null);

export function RuntimeProvider({ runtime, children }: { runtime: ExpenseRuntime; children: ReactNode }) {
  return (
    <RuntimeContext.Provider value={runtime}>
      <QueryClientProvider client={runtime.queryClient}>{children}</QueryClientProvider>
    </RuntimeContext.Provider>
  );
}

export function useRuntime(): ExpenseRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("记账本的组件需要在插件页面内使用");
  return runtime;
}
