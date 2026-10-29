/**
 * 首页「记账」卡：本月还能花多少（带时间进度条）、今天花了多少，下面是一句话记账。
 */
import { ChevronRight } from "lucide-react";
import { cn } from "@tau/ui";
import { monthOf } from "../data/model";
import { dailyRoom, isFixed } from "../data/stats";
import { useRuntime } from "../runtime";
import { Meter, yuan } from "./bits";
import { QuickAdd } from "./QuickAdd";
import { useLedger, useNow } from "./queries";

export function HomePanel() {
  const { pages } = useRuntime();
  const { today, time } = useNow();
  const query = useLedger(monthOf(today), today);
  if (!query.data) return null;
  const { stat, config, txs } = query.data;
  const left = stat.budget - stat.total;
  const ratio = stat.budget > 0 ? stat.total / stat.budget : 0;
  const fast = left < 0 || stat.paceRatio > stat.pace;
  const todaySpent = txs.filter(t => t.date === today && !isFixed(t)).reduce((s, t) => s + t.cents, 0);
  const perDay = dailyRoom(stat);
  return (
    <div className="ex:flex ex:flex-col ex:gap-3 ex:px-1">
      <div className="ex:grid ex:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] ex:gap-3">
        <div className="ex:flex ex:min-w-0 ex:flex-col ex:gap-1.5 ex:px-2 ex:py-1.5">
          <span className="ex:text-ink-3 ex:text-[11.5px]">{stat.budget > 0 ? (left < 0 ? "本月已超" : `本月还能花 · 剩 ${stat.daysLeft} 天`) : "本月已花"}</span>
          <b className={cn("ex:text-[20px] ex:leading-tight ex:font-semibold ex:tabular-nums", left < 0 && stat.budget > 0 && "ex:text-danger")}>
            {yuan(stat.budget > 0 ? Math.abs(left) : stat.total)}
          </b>
          {stat.budget > 0 && <Meter ratio={ratio} pace={stat.pace} color={fast ? "var(--tau-danger)" : "var(--tau-accent)"} className="ex:h-1.5" />}
        </div>
        <div className="ex:flex ex:min-w-0 ex:flex-col ex:gap-1.5 ex:px-2 ex:py-1.5">
          <span className="ex:text-ink-3 ex:text-[11.5px]">今天</span>
          <b className="ex:text-[20px] ex:leading-tight ex:font-semibold ex:tabular-nums">{yuan(todaySpent)}</b>
          {stat.budget > 0 && left > 0 && <span className="ex:text-ink-3 ex:text-[11.5px] ex:tabular-nums">每天最多 {yuan(perDay)}</span>}
        </div>
      </div>
      <QuickAdd today={today} time={time} config={config} stat={stat} />
      <button
        type="button"
        onClick={() => void pages.main?.open()}
        className="ex:text-ink-3 ex:hover:text-ink-1 ex:inline-flex ex:items-center ex:gap-0.5 ex:self-start ex:rounded-[6px] ex:px-1 ex:py-0.5 ex:text-[12px]"
      >
        查看账本
        <ChevronRight className="ex:size-[13px]" strokeWidth={1.75} />
      </button>
    </div>
  );
}
