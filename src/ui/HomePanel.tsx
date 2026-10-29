/**
 * 首页「记账」卡：本月还能花多少（带时间进度条）、今天花了多少，下面是一句话记账。
 */
import type { ReactNode } from "react";
import { cn } from "@tau/ui";
import { monthOf } from "../data/model";
import { dailyRoom, isFixed } from "../data/stats";
import { Meter, yuan } from "./bits";
import { QuickAdd } from "./QuickAdd";
import { useLedger, useNow } from "./queries";

export function HomePanel() {
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
    <div className="ex:flex ex:flex-col ex:gap-3">
      <div className="ex:grid ex:grid-cols-2 ex:gap-4">
        <Stat
          label={stat.budget > 0 ? (left < 0 ? "本月已超" : `本月还能花 · 剩 ${stat.daysLeft} 天`) : "本月已花"}
          value={yuan(stat.budget > 0 ? Math.abs(left) : stat.total)}
          danger={left < 0 && stat.budget > 0}
          foot={stat.budget > 0 ? <Meter ratio={ratio} pace={stat.pace} color={fast ? "var(--tau-danger)" : "var(--tau-accent)"} className="ex:h-1.5 ex:w-full" /> : null}
        />
        <Stat label="今天" value={yuan(todaySpent)} foot={stat.budget > 0 && left > 0 ? `每天最多 ${yuan(perDay)}` : null} />
      </div>
      <QuickAdd today={today} time={time} config={config} stat={stat} />
    </div>
  );
}

/** 指标格：标签 / 单行数字 / 固定高度的底行（进度条或一行说明），同排各格基线对齐 */
function Stat({ label, value, danger, foot }: { label: string; value: string; danger?: boolean; foot: ReactNode }) {
  return (
    <div className="ex:flex ex:min-w-0 ex:flex-col ex:gap-1">
      <span className="ex:text-ink-3 ex:truncate ex:text-[11.5px]">{label}</span>
      <b className={cn("ex:truncate ex:text-[20px] ex:leading-[26px] ex:font-semibold ex:tabular-nums", danger && "ex:text-danger")}>{value}</b>
      <div className="ex:text-ink-3 ex:flex ex:h-4 ex:min-w-0 ex:items-center ex:text-[11.5px] ex:tabular-nums">
        {typeof foot === "string" ? <span className="ex:truncate">{foot}</span> : foot}
      </div>
    </div>
  );
}
