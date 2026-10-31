/**
 * 回顾：左边近 6 个月支出构成（分类堆叠柱 + 月预算虚线，点柱子切换月份），右边一周里哪天花得多（近 90 天日均可控支出）。
 * 两列等高；周几柱子在撑满列高的轨道里按比例伸长，数值跟着柱顶走。
 */
import { useState } from "react";
import { cn } from "@tau/ui";
import { formatYuan, type Category } from "../data/model";
import type { MonthTotal } from "../data/stats";
import { Card, CardHead, WEEKDAYS, categoryColor, monthLabel, useWidth, yuan } from "./bits";

const H = 196;
const PAD_L = 36;
const PAD_R = 8;
const PAD_T = 18;
const AXIS = 24;

export function Review({
  months,
  categories,
  budget,
  selected,
  current,
  onPickMonth,
  weekday,
}: {
  months: readonly MonthTotal[];
  categories: readonly Category[];
  budget: number;
  selected: string;
  current: string;
  onPickMonth(month: string): void;
  weekday: { mean: (number | null)[]; days: number[] };
}) {
  return (
    <Card className="ex:grid ex:grid-cols-1 ex:@[760px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="ex:flex ex:min-w-0 ex:flex-col">
        <CardHead title="近 6 个月" note="点柱子切换月份" />
        <MonthsChart months={months} categories={categories} budget={budget} selected={selected} current={current} onPick={onPickMonth} />
        <div className="ex:text-ink-2 ex:flex ex:flex-wrap ex:gap-x-3 ex:gap-y-1.5 ex:px-[18px] ex:pt-0.5 ex:pb-3.5 ex:text-[11.5px]">
          {categories.map(c => (
            <span key={c.id} className="ex:inline-flex ex:items-center ex:gap-1.5">
              <i className="ex:size-2.5 ex:rounded-[3px]" style={{ background: categoryColor(c.color) }} />
              {c.name}
            </span>
          ))}
        </div>
      </div>
      <div className="ex:@[760px]:border-line-1 ex:flex ex:min-w-0 ex:flex-col ex:@[760px]:border-l">
        <CardHead title="一周里哪天花得多" note="近 90 天日均" />
        <WeekdayBars weekday={weekday} />
      </div>
    </Card>
  );
}

export function MonthsChart({
  months,
  categories,
  budget,
  selected,
  current,
  onPick,
}: {
  months: readonly MonthTotal[];
  categories: readonly Category[];
  budget: number;
  selected: string;
  current: string;
  onPick(month: string): void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(budget, ...months.map(m => m.total), 1);
  const step = niceStep(max);
  const hi = Math.ceil(max / step) * step;
  const plotH = H - PAD_T - AXIS;
  const y = (v: number) => PAD_T + (1 - v / hi) * plotH;
  const slot = (Math.max(1, width) - PAD_L - PAD_R) / Math.max(1, months.length);
  const bw = Math.min(40, slot * 0.46);
  const ticks: number[] = [];
  for (let v = 0; v <= hi; v += step) ticks.push(v);
  const known = new Set(categories.map(c => c.id));
  const h = hover != null ? months[hover] : null;

  return (
    <div ref={ref} className="ex:relative ex:mt-1.5 ex:mr-3 ex:ml-1" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} className="ex:block ex:overflow-visible" role="img" aria-label="近 6 个月每月支出">
          {ticks.map(v => (
            <g key={v}>
              <line x1={PAD_L} x2={width - PAD_R} y1={y(v)} y2={y(v)} stroke="var(--tau-line-2)" />
              <text x={PAD_L - 8} y={y(v) + 3.5} textAnchor="end" className="ex:fill-ink-3 ex:text-[10.5px] ex:tabular-nums">
                {v ? short(v) : 0}
              </text>
            </g>
          ))}
          {budget > 0 && (
            <g>
              <line x1={PAD_L} x2={width - PAD_R} y1={y(budget)} y2={y(budget)} stroke="var(--tau-ink-2)" strokeWidth={1.2} strokeDasharray="4 4" />
              <text x={width - PAD_R} y={y(budget) - 6} textAnchor="end" className="ex:fill-ink-2 ex:text-[10.5px]">
                预算 {formatYuan(budget)}
              </text>
            </g>
          )}
          {months.map((m, k) => {
            const cx = PAD_L + slot * (k + 0.5);
            const on = m.month === selected;
            const segs = [
              ...categories.filter(c => (m.byCategory[c.id] ?? 0) > 0).map(c => ({ id: c.id, color: categoryColor(c.color), v: m.byCategory[c.id] })),
              // 已删除分类的历史流水
              ...Object.entries(m.byCategory)
                .filter(([id, v]) => !known.has(id) && v > 0)
                .map(([id, v]) => ({ id, color: "var(--tau-ink-3)", v })),
            ];
            let acc = 0;
            return (
              <g key={m.month} opacity={on ? 1 : 0.42}>
                {segs.map((s, j) => {
                  const y0 = y(acc);
                  const y1 = y(acc + s.v);
                  acc += s.v;
                  const top = j === segs.length - 1;
                  const hgt = Math.max(0, y0 - y1 - 2);
                  return top ? (
                    <path
                      key={s.id}
                      d={`M${cx - bw / 2},${y0 - 2} V${Math.min(y0 - 2, y1 + 4)} a4,4 0 0 1 4,-4 H${cx + bw / 2 - 4} a4,4 0 0 1 4,4 V${y0 - 2}Z`}
                      fill={s.color}
                    />
                  ) : (
                    <rect key={s.id} x={cx - bw / 2} y={y1} width={bw} height={hgt} fill={s.color} />
                  );
                })}
                <text x={cx} y={y(m.total) - 6} textAnchor="middle" className={cn("ex:text-[10.5px] ex:tabular-nums", on ? "ex:fill-ink-1 ex:font-semibold" : "ex:fill-ink-3")}>
                  {m.total ? formatYuan(m.total) : ""}
                </text>
                <text x={cx} y={PAD_T + plotH + 16} textAnchor="middle" className={cn("ex:text-[11px]", on ? "ex:fill-ink-1 ex:font-semibold" : "ex:fill-ink-3")}>
                  {monthLabel(m.month).replace(" ", "")}
                </text>
              </g>
            );
          })}
          {months.map((m, k) => (
            <rect
              key={`hit${m.month}`}
              x={PAD_L + slot * k}
              y={0}
              width={slot}
              height={H}
              fill="transparent"
              className="ex:cursor-pointer"
              onPointerEnter={() => setHover(k)}
              onClick={() => onPick(m.month)}
            >
              <title>{`${monthLabel(m.month)} ${yuan(m.total)}`}</title>
            </rect>
          ))}
        </svg>
      )}
      {h && hover != null && (
        <div
          className="ex:bg-surface ex:shadow-float ex:pointer-events-none ex:absolute ex:z-10 ex:min-w-[150px] ex:rounded-[10px] ex:px-[11px] ex:py-2 ex:text-[12px] ex:whitespace-nowrap"
          style={{ top: 4, ...(PAD_L + slot * (hover + 1) + 170 > width ? { right: width - PAD_L - slot * hover + 6 } : { left: PAD_L + slot * (hover + 1) - 6 }) }}
        >
          <div className="ex:text-ink-3 ex:mb-0.5 ex:text-[11px]">
            {h.month.slice(0, 4)} 年 {monthLabel(h.month)}
            {h.month === current ? "（进行中）" : ""}
          </div>
          {[...categories]
            .reverse()
            .filter(c => (h.byCategory[c.id] ?? 0) > 0)
            .map(c => (
              <div key={c.id} className="ex:flex ex:items-center ex:gap-2 ex:leading-[1.75]">
                <i className="ex:h-0.5 ex:w-2.5 ex:shrink-0 ex:rounded-full" style={{ background: categoryColor(c.color) }} />
                {c.name}
                <b className="ex:ml-auto ex:pl-3 ex:font-semibold ex:tabular-nums">{yuan(h.byCategory[c.id])}</b>
              </div>
            ))}
          <div className="ex:border-line-1 ex:mt-1 ex:flex ex:border-t ex:pt-1 ex:leading-[1.75]">
            合计<b className="ex:ml-auto ex:font-semibold ex:tabular-nums">{yuan(h.total)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

export function WeekdayBars({ weekday }: { weekday: { mean: (number | null)[]; days: number[] } }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = weekday.mean.map(v => v ?? 0);
  const max = Math.max(...values, 1);
  const peak = values.indexOf(Math.max(...values));
  const weekend = (values[5] + values[6]) / 2;
  const workday = values.slice(0, 5).reduce((s, v) => s + v, 0) / 5;
  return (
    <>
      <div className="ex:relative ex:grid ex:min-h-[132px] ex:flex-1 ex:grid-cols-7 ex:grid-rows-[minmax(0,1fr)] ex:gap-2 ex:px-[18px] ex:pt-3 ex:pb-2.5" onPointerLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <div key={i} className="ex:grid ex:h-full ex:min-h-0 ex:grid-rows-[minmax(0,1fr)_auto] ex:justify-items-center ex:gap-1" onPointerEnter={() => setHover(i)}>
            <span className="ex:flex ex:h-full ex:min-h-0 ex:w-full ex:max-w-[30px] ex:flex-col ex:items-center ex:justify-end ex:gap-[3px]">
              <b className="ex:text-ink-2 ex:text-[10.5px] ex:font-medium ex:tabular-nums">{weekday.mean[i] == null ? "—" : formatYuan(v)}</b>
              <i
                className="ex:bg-accent ex:block ex:w-full ex:rounded-t-[4px]"
                style={{ height: `calc((100% - 18px) * ${(v / max).toFixed(3)})`, opacity: i === peak ? 1 : 0.45 }}
              />
            </span>
            <span className="ex:text-ink-3 ex:text-[10.5px]">{WEEKDAYS[i]}</span>
          </div>
        ))}
        {hover != null && (
          <div
            className="ex:bg-surface ex:shadow-float ex:pointer-events-none ex:absolute ex:top-2 ex:z-10 ex:rounded-[10px] ex:px-[11px] ex:py-2 ex:text-[12px] ex:whitespace-nowrap"
            style={hover > 3 ? { right: `calc(${((6 - hover) / 7) * 100}% + 28px)` } : { left: `calc(${((hover + 1) / 7) * 100}% + 6px)` }}
          >
            <div className="ex:text-ink-3 ex:mb-0.5 ex:text-[11px]">
              周{WEEKDAYS[hover]} · {weekday.days[hover]} 天
            </div>
            <div className="ex:flex ex:gap-3">
              日均可控支出<b className="ex:ml-auto ex:font-semibold ex:tabular-nums">{yuan(values[hover])}</b>
            </div>
          </div>
        )}
      </div>
      <p className="ex:text-ink-3 ex:px-[18px] ex:pb-3.5 ex:text-[11.5px]">
        {max <= 1
          ? "记几天之后，这里会显示一周里哪天花得多。"
          : Math.abs(weekend - workday) < 500
            ? "周末和工作日花得差不多。"
            : weekend > workday
              ? `周末平均每天比工作日多花 ${yuan(weekend - workday)}。`
              : `工作日平均每天比周末多花 ${yuan(workday - weekend)}。`}
      </p>
    </>
  );
}

/** 让纵轴刻度落在 1/2/5 × 10ⁿ 上，约 3–4 格 */
function niceStep(max: number) {
  const raw = max / 3.5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map(k => k * mag).find(s => s >= raw) ?? 10 * mag;
}

/** 刻度标签：分 → 「3k」「1.5万」 */
function short(cents: number) {
  const yuanValue = cents / 100;
  if (yuanValue >= 10000) return `${+(yuanValue / 10000).toFixed(1)}万`;
  if (yuanValue >= 1000) return `${+(yuanValue / 1000).toFixed(1)}k`;
  return String(Math.round(yuanValue));
}
