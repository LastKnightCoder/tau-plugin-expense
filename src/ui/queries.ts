/**
 * 页面与首页卡片的数据：读当前月及之前 HISTORY_MONTHS 个月的流水（近 6 个月图、对比基准、周几分布都在这个窗口内），
 * 汇总成选中月份的 MonthStat。打开时先补记固定支出（每次启用只补一次）。
 * 写入后由调用方 invalidate EXPENSE_KEY；跨窗口与同步写入经运行时的事件订阅刷新。
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, dateKey, monthOf, timeKey } from "../data/model";
import { monthStat, monthTotals } from "../data/stats";
import { EXPENSE_KEY, useRuntime } from "../runtime";

/** 近 6 个月图 + 最早一个月还要往前 3 个月的基准 */
export const HISTORY_MONTHS = 9;
export const CHART_MONTHS = 6;

/** 当前本地日期与时间，每分钟更新；跨过零点时页面自动换到新的一天 */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return { today: dateKey(now), time: timeKey(now), date: now };
}

export function useConfig() {
  const { data } = useRuntime();
  return useQuery({ queryKey: [...EXPENSE_KEY, "config"], queryFn: () => data.getConfig() });
}

export function useAliases() {
  const { data } = useRuntime();
  return useQuery({ queryKey: [...EXPENSE_KEY, "aliases"], queryFn: () => data.getAliases() });
}

/** month 为当前查看的月份；历史数据始终以「今天所在月」为终点读取 */
export function useLedger(month: string, today: string) {
  const runtime = useRuntime();
  const { data } = runtime;
  const config = useConfig();
  const current = monthOf(today);
  return useQuery({
    queryKey: [...EXPENSE_KEY, "ledger", current, month, today, config.data ?? null],
    enabled: config.isSuccess,
    queryFn: async () => {
      const cfg = config.data!;
      // 同一天、同一组规则只补记一次（规则改了或过了零点再补）。补记写入会触发刷新，
      // 刷新时共用进行中的那次；失败时清掉，下次重试
      const mark = `${today}|${JSON.stringify(cfg.recurring)}`;
      if (runtime.recurring?.mark !== mark) {
        const done = data.postRecurring(cfg, today);
        runtime.recurring = { mark, done };
        done.catch(() => {
          if (runtime.recurring?.done === done) runtime.recurring = null;
        });
      }
      await runtime.recurring!.done;
      const from = addMonths(current, -(HISTORY_MONTHS - 1));
      const txs = await data.listMonths(from, current);
      const months = Array.from({ length: HISTORY_MONTHS }, (_, i) => addMonths(from, i));
      const history = monthTotals(txs, months);
      return {
        txs,
        history,
        stat: monthStat(month, txs, cfg, today, history),
        now: month === current ? null : monthStat(current, txs, cfg, today, history),
        config: cfg,
      };
    },
    placeholderData: previous => previous,
  });
}
