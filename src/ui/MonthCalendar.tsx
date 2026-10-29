/**
 * 月历：周一开头，第 8 列是周合计。每格显示当天可控支出、最大一笔的备注，底部一根分类构成条：
 * 条长 = 金额（满半格 = 日均额度，超出额度时金额标红，超过整格时末端加三角），颜色 = 分类。
 * 选了分类时只画这一类，基准换成该分类的日均额度。固定支出不进日历，当天有固定支出时左上角打点。
 */
import { useState } from "react";
import { cn } from "@tau/ui";
import type { Category } from "../data/model";
import type { DayStat, MonthStat } from "../data/stats";
import { WEEKDAYS, categoryColor, dayLabel, useWidth, yuan } from "./bits";

export function MonthCalendar({
  stat,
  categories,
  today,
  selectedDay,
  selectedCategory,
  onPickDay,
}: {
  stat: MonthStat;
  categories: readonly Category[];
  today: string;
  selectedDay: string | null;
  selectedCategory: string | null;
  onPickDay(date: string): void;
}) {
  const [hover, setHover] = useState<{ day: DayStat; x: number; y: number } | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const filterCat = selectedCategory ? categories.find(c => c.id === selectedCategory) ?? null : null;
  const allowance = filterCat ? filterCat.budget / stat.days : stat.allowance;
  // 没设预算时用本月可控支出的日均做基准，条长仍可比较
  const pastDays = stat.calendar.filter(d => !d.future);
  const fallback = pastDays.length ? pastDays.reduce((s, d) => s + amountOf(d, selectedCategory), 0) / pastDays.length : 0;
  const scale = Math.max(1, (allowance > 0 ? allowance : fallback) * 2);
  const first = (new Date(`${stat.month}-01T00:00:00`).getDay() + 6) % 7;
  const cells: (DayStat | null)[] = [...Array<null>(first).fill(null), ...stat.calendar];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  return (
    <div ref={ref} className="ex:relative ex:px-[18px] ex:pt-2.5 ex:pb-1" onPointerLeave={() => setHover(null)}>
      <div className="ex:grid ex:grid-cols-[repeat(7,minmax(0,1fr))_64px] ex:gap-[5px]">
        {[...WEEKDAYS].map(w => (
          <span key={w} className="ex:text-ink-3 ex:pb-0.5 ex:pl-2 ex:text-[11px]">
            {w}
          </span>
        ))}
        <span className="ex:text-ink-3 ex:pr-1 ex:pb-0.5 ex:text-right ex:text-[11px]">周合计</span>
        {weeks.map((week, w) => {
          const total = week.reduce((s, d) => s + (d && !d.future ? amountOf(d, selectedCategory) : 0), 0);
          return [
            ...week.map((d, k) =>
              d == null ? (
                <span key={`b${w}-${k}`} />
              ) : d.future ? (
                <span key={d.date} className="ex:flex ex:h-16 ex:rounded-[10px] ex:px-2 ex:pt-1.5 ex:shadow-[inset_0_0_0_1px_var(--tau-line-2)]">
                  <span className="ex:text-ink-3 ex:text-[11.5px] ex:tabular-nums">{Number(d.date.slice(8))}</span>
                </span>
              ) : (
                <Cell
                  key={d.date}
                  day={d}
                  categories={categories}
                  selectedCategory={selectedCategory}
                  scale={scale}
                  overAt={allowance > 0 ? allowance : null}
                  today={d.date === today}
                  selected={d.date === selectedDay}
                  onClick={() => onPickDay(d.date)}
                  onHover={(x, y) => setHover({ day: d, x, y })}
                />
              )
            ),
            <span key={`w${w}`} className="ex:text-ink-3 ex:self-center ex:pr-1 ex:text-right ex:text-[10.5px] ex:tabular-nums">
              {total ? yuan(total) : ""}
            </span>,
          ];
        })}
      </div>
      {hover && <Tip day={hover.day} x={hover.x} y={hover.y} flip={hover.x > width - 190} categories={categories} />}
    </div>
  );
}

function amountOf(day: DayStat, category: string | null) {
  return category ? (day.byCategory[category] ?? 0) : day.flex;
}

function Cell({
  day,
  categories,
  selectedCategory,
  scale,
  overAt,
  today,
  selected,
  onClick,
  onHover,
}: {
  day: DayStat;
  categories: readonly Category[];
  selectedCategory: string | null;
  scale: number;
  overAt: number | null;
  today: boolean;
  selected: boolean;
  onClick(): void;
  onHover(x: number, y: number): void;
}) {
  const amount = amountOf(day, selectedCategory);
  const segments = categories.filter(c => (selectedCategory ? c.id === selectedCategory : true) && (day.byCategory[c.id] ?? 0) > 0);
  const full = Math.min(1, amount / scale);
  const top = selectedCategory ? null : day.top;
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerMove={e => {
        // 相对日历容器定位提示框（格子的 offsetParent 就是带 relative 的容器）
        const r = (e.currentTarget.offsetParent as HTMLElement | null)?.getBoundingClientRect();
        if (r) onHover(e.clientX - r.left, e.clientY - r.top);
      }}
      aria-pressed={selected}
      aria-label={`${dayLabel(day.date)} 支出 ${yuan(amount)}`}
      className={cn(
        "ex:relative ex:flex ex:h-16 ex:min-w-0 ex:flex-col ex:rounded-[10px] ex:px-2 ex:pt-1.5 ex:pb-[7px] ex:text-left ex:transition-[background] ex:duration-150 ex:ease-tau-out",
        selected ? "ex:bg-surface ex:shadow-[0_0_0_2px_var(--tau-accent-text)]" : "ex:bg-hover ex:hover:bg-press",
        today && !selected && "ex:shadow-[inset_0_0_0_1.5px_var(--tau-ink-1)]"
      )}
    >
      <span className="ex:flex ex:items-baseline ex:gap-1">
        <span className="ex:text-ink-3 ex:text-[11.5px] ex:tabular-nums">{Number(day.date.slice(8))}</span>
        {day.fixed > 0 && !selectedCategory && <i aria-hidden className="ex:bg-ink-3 ex:size-[5px] ex:self-center ex:rounded-full" />}
        <span
          className={cn(
            "ex:ml-auto ex:text-[12.5px] ex:tabular-nums",
            amount ? "ex:font-semibold" : "ex:text-ink-3",
            amount && overAt != null && amount > overAt && "ex:text-danger"
          )}
        >
          {amount ? yuan(amount).slice(1) : "0"}
        </span>
      </span>
      <span className="ex:text-ink-3 ex:mt-0.5 ex:truncate ex:text-[10.5px]">{top ? top.note || "—" : today ? "记录中" : amount ? "" : "没花钱"}</span>
      <span className="ex:mt-auto ex:flex ex:h-1.5 ex:items-center ex:gap-0.5">
        {segments.map((c, i) => (
          <i
            key={c.id}
            className={cn(
              "ex:block ex:h-full",
              i === 0 && "ex:rounded-l-[3px]",
              i === segments.length - 1 && amount <= scale && "ex:rounded-r-[3px]"
            )}
            style={{ width: `calc(${((day.byCategory[c.id] ?? 0) / amount) * full * 100}% - 2px)`, background: categoryColor(c.color) }}
          />
        ))}
        {amount > scale && <i aria-hidden className="ex:border-l-ink-2 ex:ml-px ex:size-0 ex:border-y-[3px] ex:border-l-[5px] ex:border-y-transparent" />}
      </span>
    </button>
  );
}

function Tip({ day, x, y, flip, categories }: { day: DayStat; x: number; y: number; flip: boolean; categories: readonly Category[] }) {
  const rows = categories.filter(c => (day.byCategory[c.id] ?? 0) > 0);
  return (
    <div
      className="ex:bg-surface ex:shadow-float ex:pointer-events-none ex:absolute ex:z-10 ex:min-w-[150px] ex:rounded-[10px] ex:px-[11px] ex:py-2 ex:text-[12px] ex:whitespace-nowrap"
      style={{ left: x + 14, top: Math.max(0, y - 20), transform: flip ? "translateX(calc(-100% - 28px))" : undefined }}
    >
      <div className="ex:text-ink-3 ex:mb-0.5 ex:text-[11px]">{dayLabel(day.date)}</div>
      {rows.length ? (
        rows.map(c => (
          <div key={c.id} className="ex:flex ex:items-center ex:gap-2 ex:leading-[1.75]">
            <i className="ex:h-0.5 ex:w-2.5 ex:shrink-0 ex:rounded-full" style={{ background: categoryColor(c.color) }} />
            {c.name}
            <b className="ex:ml-auto ex:pl-3 ex:font-semibold ex:tabular-nums">{yuan(day.byCategory[c.id])}</b>
          </div>
        ))
      ) : (
        <div className="ex:text-ink-3">没有可控支出</div>
      )}
      {day.fixed > 0 && <div className="ex:text-ink-3 ex:mt-1 ex:text-[11px]">另有固定支出 {yuan(day.fixed)}，不计入日历</div>}
    </div>
  );
}
