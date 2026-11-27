/**
 * 顶部一条：本月还能花多少（剩余天数、每天最多、时间进度竖线）| 今天 | 比上月同期。
 * 总是展示今天所在的月份，不随日历翻页变化。
 */
import { AlertTriangle, CalendarDays, Check, TrendingUp, Wallet } from "lucide-react";
import { useI18n } from "@tau/plugins";
import { cn } from "@tau/ui";
import type { Tx } from "../data/model";
import { dailyRoom, isFixed, type MonthStat } from "../data/stats";
import { messages } from "../i18n";
import { Card, Diff, Meter, monthLabel, yuan } from "./bits";

export function Summary({
  stat,
  todayTxs,
  yesterday,
  lastSame,
  onSetup,
}: {
  stat: MonthStat;
  todayTxs: readonly Tx[];
  yesterday: number;
  lastSame: { month: string; total: number } | null;
  onSetup(): void;
}) {
  const { t, locale } = useI18n(messages);
  const left = stat.budget - stat.total;
  const ratio = stat.budget > 0 ? stat.total / stat.budget : 0;
  // 快慢只比可控支出：固定支出月初就记入，算进去每个月初都会误报
  const fast = stat.budget > 0 && (left < 0 || stat.paceRatio > stat.pace);
  const perDay = dailyRoom(stat);
  const today = todayTxs.filter(t => !isFixed(t)).reduce((s, t) => s + t.cents, 0);
  const label = "ex:text-ink-3 ex:flex ex:items-center ex:gap-1.5 ex:text-[12px]";
  const month = monthLabel(stat.month, locale);

  return (
    <Card className="ex:grid ex:grid-cols-1 ex:gap-4 ex:px-5 ex:py-4 ex:@[720px]:grid-cols-[minmax(0,1.7fr)_1px_minmax(0,0.8fr)_1px_minmax(0,0.9fr)] ex:@[720px]:gap-5">
      <div className="ex:flex ex:min-w-0 ex:flex-col ex:gap-2">
        <span className={label}>
          <Wallet className="ex:size-[13px]" strokeWidth={1.75} />
          {t("summary.remaining", { month, days: stat.daysLeft })}
        </span>
        {stat.budget > 0 ? (
          <>
            <div className="ex:flex ex:flex-wrap ex:items-baseline ex:gap-2.5">
              <b className={cn("ex:text-[40px] ex:leading-none ex:font-semibold ex:tracking-[-0.03em] ex:tabular-nums", left < 0 && "ex:text-danger")}>
                {left < 0 ? "−" : ""}
                {yuan(Math.abs(left))}
              </b>
              <span
                className={cn(
                  "ex:inline-flex ex:h-[22px] ex:items-center ex:gap-1 ex:rounded-full ex:px-2 ex:text-[11.5px] ex:font-medium",
                  fast ? "ex:bg-danger-soft ex:text-danger" : "ex:bg-ok-soft ex:text-ok"
                )}
              >
                {fast ? <AlertTriangle className="ex:size-3" strokeWidth={2} /> : <Check className="ex:size-3" strokeWidth={2} />}
                {left < 0 ? t("summary.overBudget") : fast ? t("summary.faster", { percent: Math.round((stat.paceRatio - stat.pace) * 100) }) : t("summary.paceOk")}
              </span>
              {left > 0 && (
                <span className="ex:text-ink-3 ex:text-[12px]">
                  {t("summary.dailyRoom", { amount: yuan(perDay) })}
                </span>
              )}
            </div>
            <Meter ratio={ratio} pace={stat.pace} color={fast ? "var(--tau-danger)" : "var(--tau-accent)"} className="ex:h-2.5" />
            <div className="ex:text-ink-3 ex:flex ex:text-[11.5px]">
              <span>
                {t("summary.spent")} <b className="ex:text-ink-1 ex:font-semibold ex:tabular-nums">{yuan(stat.total)}</b> / {yuan(stat.budget)}
              </span>
              <span className="ex:ml-auto">{t("summary.paceNote", { percent: Math.round(stat.pace * 100) })}</span>
            </div>
          </>
        ) : (
          <div className="ex:flex ex:flex-col ex:items-start ex:gap-2">
            <b className="ex:text-[32px] ex:leading-none ex:font-semibold ex:tabular-nums">{yuan(stat.total)}</b>
            <button type="button" onClick={onSetup} className="ex:text-accent-text ex:text-[12px] ex:hover:underline">
              {t("summary.setBudgetHint")}
            </button>
          </div>
        )}
      </div>
      <span className="ex:bg-line-1 ex:hidden ex:@[720px]:block" />
      <div className="ex:flex ex:min-w-0 ex:flex-col ex:gap-2">
        <span className={label}>
          <CalendarDays className="ex:size-[13px]" strokeWidth={1.75} />
          {t("date.today")}
        </span>
        <div className="ex:flex ex:items-baseline ex:gap-2">
          <b className="ex:text-[26px] ex:leading-none ex:font-semibold ex:tabular-nums">{yuan(today)}</b>
          <span className="ex:text-ink-3 ex:text-[12px]">{t("common.txCount", { count: todayTxs.length })}</span>
        </div>
        <div className="ex:text-ink-2 ex:mt-auto ex:text-[12px] ex:leading-[1.7]">
          {t("summary.yesterday")} <b className="ex:text-ink-1 ex:font-semibold ex:tabular-nums">{yuan(yesterday)}</b>
          {stat.allowance > 0 && (
            <>
              <br />
              {t("summary.allowance", { amount: yuan(stat.allowance) })}
            </>
          )}
        </div>
      </div>
      <span className="ex:bg-line-1 ex:hidden ex:@[720px]:block" />
      <div className="ex:flex ex:min-w-0 ex:flex-col ex:gap-2">
        <span className={label}>
          <TrendingUp className="ex:size-[13px]" strokeWidth={1.75} />
          {lastSame ? t("summary.vsSame", { month: monthLabel(lastSame.month, locale) }) : t("summary.vsLastMonth")}
        </span>
        {lastSame && lastSame.total > 0 ? (
          <>
            <Diff value={stat.total - lastSame.total} className="ex:text-[26px] ex:leading-none" />
            <div className="ex:text-ink-2 ex:mt-auto ex:text-[12px]">
              {t("summary.lastMonthSame")} <b className="ex:text-ink-1 ex:font-semibold ex:tabular-nums">{yuan(lastSame.total)}</b>
            </div>
          </>
        ) : (
          <span className="ex:text-ink-3 ex:text-[12px]">{t("summary.noLastMonth")}</span>
        )}
      </div>
    </Card>
  );
}
