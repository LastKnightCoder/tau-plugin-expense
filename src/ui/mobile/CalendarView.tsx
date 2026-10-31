/**
 * 手机月历（二级页）：每格日期、金额、底部分类色条（条长 = 当天可控支出，满格 = 2 倍日均额度；颜色 = 分类构成），
 * 超过日均额度的金额标红，有固定支出的日子打点。左右滑动或箭头翻月（近 6 个月）；点某天弹出当天流水。
 * 参数 category 只看一类，基准换成该类日均额度。
 */
import { useRef, useState, type PointerEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { cn } from "@tau/ui";
import { addMonths, monthOf, type Category, type Tx } from "../../data/model";
import type { DayStat, MonthStat } from "../../data/stats";
import { useRuntime } from "../../runtime";
import { WEEKDAYS, categoryColor, dayLabel, yuan } from "../bits";
import { CHART_MONTHS } from "../queries";
import { removeWithUndo } from "./actions";
import { SwipeRow, TxRow } from "./HomeCards";
import { CatIcon, MCard, PrimaryButton } from "./parts";
import { Sheet } from "./Sheet";
import { TxSheet } from "./TxSheet";

export function CalendarView({
  month,
  onMonth,
  current,
  stat,
  txs,
  categories,
  category,
  onClearCategory,
  today,
  spentOf,
}: {
  month: string;
  onMonth(month: string): void;
  current: string;
  stat: MonthStat;
  txs: readonly Tx[];
  categories: readonly Category[];
  category: string | null;
  onClearCategory(): void;
  today: string;
  spentOf(category: string, month: string): number;
}) {
  const { pages } = useRuntime();
  const runtime = useRuntime();
  const client = useQueryClient();
  const [day, setDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const only = category ? (categories.find(c => c.id === category) ?? null) : null;
  const earliest = addMonths(current, -(CHART_MONTHS - 1));
  const canPrev = month > earliest;
  const canNext = month < current;
  const swipe = useRef<{ x: number; y: number } | null>(null);

  const allowance = only ? only.budget / stat.days : stat.allowance;
  const past = stat.calendar.filter(d => !d.future);
  const amountOf = (d: DayStat) => (only ? (d.byCategory[only.id] ?? 0) : d.flex);
  const fallback = past.length ? past.reduce((s, d) => s + amountOf(d), 0) / past.length : 0;
  const scale = Math.max(1, (allowance > 0 ? allowance : fallback) * 2);
  const first = (new Date(`${month}-01T00:00:00`).getDay() + 6) % 7;
  const peak = past.reduce<DayStat | null>((best, d) => (amountOf(d) > (best ? amountOf(best) : 0) ? d : best), null);
  const zero = past.filter(d => amountOf(d) === 0).length;
  const onlyStat = only ? stat.categories.find(c => c.id === only.id) : null;

  const dayTxs = day ? txs.filter(t => t.date === day && (!only || t.category === only.id)).sort((a, b) => b.time.localeCompare(a.time)) : [];
  const dayStat = day ? stat.calendar.find(d => d.date === day) : null;

  const onDown = (e: PointerEvent) => (swipe.current = { x: e.clientX, y: e.clientY });
  const onUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(e.clientY - s.y) * 1.5) return;
    if (dx < 0 && canNext) onMonth(addMonths(month, 1));
    if (dx > 0 && canPrev) onMonth(addMonths(month, -1));
  };

  return (
    <div className="ex:flex ex:flex-col ex:gap-3 ex:pt-1 ex:pb-6">
      {only && (
        <div className="ex:flex">
          <button
            type="button"
            onClick={onClearCategory}
            className="ex:bg-ink-1 ex:text-ink-inverse ex:flex ex:h-8 ex:items-center ex:gap-1.5 ex:rounded-full ex:pr-2.5 ex:pl-[5px] ex:text-[12.5px]"
          >
            <CatIcon category={only} size={22} />
            只看{only.name}
            <X className="ex:size-3.5 ex:opacity-70" />
          </button>
        </div>
      )}
      <MCard className="ex:px-3 ex:pt-2.5">
        <div className="ex:flex ex:items-center ex:gap-1">
          <button type="button" aria-label="上个月" disabled={!canPrev} onClick={() => onMonth(addMonths(month, -1))} className="ex:text-ink-2 ex:grid ex:size-8 ex:place-items-center ex:disabled:opacity-30">
            <ChevronLeft className="ex:size-[18px]" />
          </button>
          <h2 className="ex:text-[15px] ex:font-[650] ex:tabular-nums">
            {month.slice(0, 4)} 年 {Number(month.slice(5))} 月
          </h2>
          <button type="button" aria-label="下个月" disabled={!canNext} onClick={() => onMonth(addMonths(month, 1))} className="ex:text-ink-2 ex:grid ex:size-8 ex:place-items-center ex:disabled:opacity-30">
            <ChevronRight className="ex:size-[18px]" />
          </button>
          <span className="ex:flex-1" />
          <span className="ex:text-ink-3 ex:text-[11.5px] ex:tabular-nums">
            {only && onlyStat ? `${only.name} ${yuan(onlyStat.spent)}${only.budget ? ` / ${yuan(only.budget).slice(1)}` : ""}` : `可控 ${yuan(stat.flex)} · 固定 ${yuan(stat.fixed)}`}
          </span>
        </div>
        <div className="ex:mt-2 ex:grid ex:touch-pan-y ex:grid-cols-7 ex:gap-[3px]" onPointerDown={onDown} onPointerUp={onUp} data-no-tab-swipe>
          {[...WEEKDAYS].map(w => (
            <span key={w} className="ex:text-ink-3 ex:pb-0.5 ex:text-center ex:text-[10.5px]">
              {w}
            </span>
          ))}
          {Array.from({ length: first }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {stat.calendar.map(d => (
            <Cell
              key={d.date}
              day={d}
              amount={amountOf(d)}
              categories={only ? [only] : categories}
              scale={scale}
              over={allowance > 0 && amountOf(d) > allowance}
              fixedDot={!only && d.fixed > 0}
              today={d.date === today}
              selected={d.date === day}
              onClick={() => setDay(d.date)}
            />
          ))}
        </div>
        {!only && (
          <div className="ex:text-ink-3 ex:mt-2.5 ex:flex ex:flex-wrap ex:gap-x-3 ex:gap-y-1 ex:text-[11px]">
            {categories
              .filter(c => stat.calendar.some(d => (d.byCategory[c.id] ?? 0) > 0))
              .map(c => (
                <span key={c.id} className="ex:inline-flex ex:items-center ex:gap-1.5">
                  <i className="ex:size-2 ex:rounded-[2px]" style={{ background: categoryColor(c.color) }} />
                  {c.name}
                </span>
              ))}
            {stat.fixed > 0 && (
              <span className="ex:inline-flex ex:items-center ex:gap-1.5">
                <i className="ex:bg-ink-3 ex:size-[5px] ex:rounded-full" />
                有固定支出
              </span>
            )}
          </div>
        )}
        {allowance > 0 && (
          <p className="ex:text-ink-3 ex:mt-1.5 ex:mb-0.5 ex:text-[11px]">
            {only ? `${only.name}日均额度` : "日均额度"} {yuan(allowance)} · 红字 = 超过日均额度
          </p>
        )}
      </MCard>
      {!only && past.length > 0 && (
        <MCard className="ex:flex ex:gap-2.5 ex:py-3">
          <div className="ex:min-w-0 ex:flex-1">
            <div className="ex:text-ink-3 ex:text-[11.5px]">花得最多的一天</div>
            <div className="ex:mt-0.5 ex:truncate ex:text-[14px] ex:font-[650]">
              {peak && amountOf(peak) > 0 ? (
                <>
                  {dayLabel(peak.date)} <span className="ex:tabular-nums">{yuan(amountOf(peak))}</span>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
          <div className="ex:min-w-0 ex:flex-1">
            <div className="ex:text-ink-3 ex:text-[11.5px]">没花钱的日子</div>
            <div className="ex:mt-0.5 ex:text-[14px] ex:font-[650]">
              <span className="ex:tabular-nums">{zero}</span> 天
            </div>
          </div>
        </MCard>
      )}

      <Sheet
        open={day != null && editing == null}
        onClose={() => setDay(null)}
        title={day ? dayLabel(day) : ""}
        subtitle={dayStat && dayTxs.length ? `${dayTxs.length} 笔${allowance > 0 && amountOf(dayStat) > allowance ? ` · 超日均 ${yuan(amountOf(dayStat) - allowance)}` : allowance > 0 ? " · 在日均额度内" : ""}` : undefined}
        trailing={dayStat ? <b className="ex:text-[16px] ex:tabular-nums">{yuan(amountOf(dayStat))}</b> : null}
      >
        <div className="ex:divide-line-2 ex:mt-1 ex:divide-y">
          {dayTxs.map(tx => (
            <SwipeRow
              key={tx.id}
              open={opened === tx.id}
              onOpen={next => setOpened(next ? tx.id : null)}
              onEdit={() => setEditing(tx)}
              onDelete={tx.recurringId ? null : () => void removeWithUndo(runtime, client, tx)}
            >
              <TxRow tx={tx} category={categories.find(c => c.id === tx.category)} onClick={() => (opened ? setOpened(null) : setEditing(tx))} />
            </SwipeRow>
          ))}
          {!dayTxs.length && <p className="ex:text-ink-3 ex:py-5 ex:text-center ex:text-[12.5px]">这天没有花钱</p>}
        </div>
        {day && monthOf(day) === current && (
          <PrimaryButton
            ghost
            className="ex:mt-2.5"
            onClick={() => {
              const offset = day === today ? "" : dayOffsetWord(day, today);
              setDay(null);
              void pages.main?.open({ add: offset });
            }}
          >
            <Plus />
            {day === today ? "记一笔" : "补记这天"}
          </PrimaryButton>
        )}
      </Sheet>
      <TxSheet tx={editing} categories={categories} today={today} spentOf={spentOf} onClose={() => setEditing(null)} />
    </div>
  );
}

/** 一句话记账只认「昨天 / 前天」；更早的日子先记到今天，再在编辑面板改日期 */
function dayOffsetWord(day: string, today: string): string {
  const diff = Math.round((new Date(`${today}T00:00`).getTime() - new Date(`${day}T00:00`).getTime()) / 86_400_000);
  return diff === 1 ? "昨天 " : diff === 2 ? "前天 " : "";
}

function Cell({
  day,
  amount,
  categories,
  scale,
  over,
  fixedDot,
  today,
  selected,
  onClick,
}: {
  day: DayStat;
  amount: number;
  categories: readonly Category[];
  scale: number;
  over: boolean;
  fixedDot: boolean;
  today: boolean;
  selected: boolean;
  onClick(): void;
}) {
  const d = Number(day.date.slice(8));
  if (day.future)
    return (
      <span className="ex:flex ex:h-[50px] ex:rounded-[9px] ex:px-1 ex:pt-1 ex:shadow-[inset_0_0_0_1px_var(--tau-line-2)]">
        <span className="ex:text-ink-3 ex:text-[10.5px] ex:tabular-nums">{d}</span>
      </span>
    );
  const segments = categories.filter(c => (day.byCategory[c.id] ?? 0) > 0);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${dayLabel(day.date)} ${yuan(amount)}`}
      className={cn(
        "ex:relative ex:flex ex:h-[50px] ex:flex-col ex:overflow-hidden ex:rounded-[9px] ex:px-1 ex:pt-1 ex:text-left",
        selected ? "ex:bg-ink-1 ex:text-ink-inverse" : "ex:bg-hover",
        today && !selected && "ex:shadow-[inset_0_0_0_1.5px_var(--tau-ink-1)]"
      )}
    >
      <span className={cn("ex:relative ex:text-[10.5px] ex:tabular-nums", !selected && "ex:text-ink-2")}>
        {d}
        {fixedDot && <i className="ex:bg-ink-3 ex:absolute ex:top-px ex:ml-0.5 ex:size-1 ex:rounded-full" />}
      </span>
      {amount > 0 && (
        <span className={cn("ex:mt-auto ex:mb-[7px] ex:text-right ex:text-[11px] ex:font-[650] ex:tabular-nums", over && !selected && "ex:text-danger")}>
          {formatShort(amount)}
        </span>
      )}
      {amount > 0 && (
        <span className="ex:absolute ex:bottom-0 ex:left-0 ex:flex ex:h-1" style={{ width: `${Math.min(1, amount / scale) * 100}%` }}>
          {segments.map(c => (
            <i key={c.id} style={{ flex: day.byCategory[c.id], background: categoryColor(c.color) }} />
          ))}
        </span>
      )}
    </button>
  );
}

/** 格子很窄：整数元，过万写成「1.2万」 */
function formatShort(cents: number) {
  const value = Math.round(cents / 100);
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : String(value);
}
