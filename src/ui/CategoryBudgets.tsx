/**
 * 分类预算：一行一类，进度条（竖线 = 时间进度，只在本月显示）、已用 / 预算、比前 3 个月平均。
 * 点一行筛选日历与流水，再点取消；选中时其他行变淡。
 */
import { AlertTriangle } from "lucide-react";
import { cn } from "@tau/ui";
import { formatYuan, type Category } from "../data/model";
import type { CategoryStat, MonthStat } from "../data/stats";
import { CategoryIcon, Diff, Meter, categoryColor, yuan } from "./bits";

const STATUS = { over: "超", fast: "快" } as const;

export function CategoryBudgets({
  stat,
  categories,
  selected,
  onPick,
}: {
  stat: MonthStat;
  categories: readonly Category[];
  selected: string | null;
  onPick(id: string): void;
}) {
  const known = new Map(categories.map(c => [c.id, c]));
  // 已删除分类的历史流水挂到「其他」的样子显示
  const rows = stat.categories
    .map(s => ({ stat: s, cat: known.get(s.id) ?? { id: s.id, name: "已删除分类", icon: "other", budget: 0, color: 6 } }))
    .filter(r => known.has(r.stat.id) || r.stat.spent > 0);
  const hasHistory = stat.categories.some(c => c.average != null);
  return (
    <div className="ex:px-3 ex:pt-1.5 ex:pb-3">
      <div className="ex:text-ink-3 ex:grid ex:h-[22px] ex:grid-cols-[104px_minmax(0,1fr)_128px_84px] ex:items-center ex:gap-3.5 ex:px-2 ex:text-[11px]">
        <span>分类</span>
        <span>已用 / 预算</span>
        <span className="ex:text-right">金额</span>
        <span className="ex:text-right">{hasHistory ? "比前 3 月平均" : ""}</span>
      </div>
      {rows.map(({ stat: s, cat }) => (
        <Row key={s.id} s={s} cat={cat} live={stat.live} pace={stat.pace} selected={selected} onPick={onPick} />
      ))}
    </div>
  );
}

function Row({
  s,
  cat,
  live,
  pace,
  selected,
  onPick,
}: {
  s: CategoryStat;
  cat: Category;
  live: boolean;
  pace: number;
  selected: string | null;
  onPick(id: string): void;
}) {
  const on = selected === s.id;
  const color = categoryColor(cat.color);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onPick(s.id)}
      className={cn(
        "ex:grid ex:h-[42px] ex:w-full ex:grid-cols-[104px_minmax(0,1fr)_128px_84px] ex:items-center ex:gap-3.5 ex:rounded-[10px] ex:px-2 ex:text-left ex:transition-opacity ex:duration-150",
        on ? "ex:bg-hover" : "ex:hover:bg-hover",
        selected && !on && "ex:opacity-50"
      )}
      style={on ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}
    >
      <span className="ex:flex ex:min-w-0 ex:items-center ex:gap-2 ex:text-[12.5px] ex:font-medium">
        <CategoryIcon category={cat} />
        <span className="ex:truncate">{cat.name}</span>
        {s.status !== "ok" && (
          <span className={cn("ex:inline-flex ex:shrink-0 ex:items-center ex:gap-0.5 ex:text-[10.5px]", s.status === "over" ? "ex:text-danger" : "ex:text-warn")}>
            <AlertTriangle className="ex:size-[11px]" strokeWidth={2} />
            {STATUS[s.status]}
          </span>
        )}
      </span>
      {cat.budget > 0 ? (
        <Meter ratio={s.spent / cat.budget} pace={live && !s.fixedOnly ? pace : null} color={color} />
      ) : (
        <span className="ex:text-ink-3 ex:text-[11.5px]">未设预算</span>
      )}
      <span className="ex:text-right ex:text-[12.5px] ex:tabular-nums">
        <b className="ex:font-semibold">{yuan(s.spent)}</b>
        {cat.budget > 0 && <span className="ex:text-ink-3 ex:text-[11.5px]"> / {formatYuan(cat.budget)}</span>}
      </span>
      <Diff value={s.average == null ? null : s.spent - s.average} className="ex:text-right ex:text-[12px]" />
    </button>
  );
}
