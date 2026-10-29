/**
 * 记账本主页（一页，从上往下是「每天看 → 偶尔查 → 月底复盘」）：
 * 左列：本月还能花多少 → 月历 → 分类预算 → 近 6 个月与一周规律；右列：一句话记账、流水（撑满剩余高度）、AI。
 * 日历的某天、某个分类、某个月柱三处联动，流水按「月 → 日 → 分类」收窄。宽度不足时右列落到左列下方。
 * 参数 add: true 时聚焦一句话输入（首页卡片与命令跳转用）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { PluginPageProps } from "@tau/plugins";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { Button, IconButton, Loading } from "@tau/ui";
import { addDays, addMonths, monthOf } from "../data/model";
import { samePeriodTotal, weekdayAverages } from "../data/stats";
import { useRuntime } from "../runtime";
import { AIPanel } from "./AIPanel";
import { Card, CardHead, categoryColor, dayLabel, monthLabel, yuan } from "./bits";
import { CategoryBudgets } from "./CategoryBudgets";
import { MonthCalendar } from "./MonthCalendar";
import { QuickAdd } from "./QuickAdd";
import { CHART_MONTHS, useLedger, useNow } from "./queries";
import { Review } from "./Review";
import { Summary } from "./Summary";
import { TxList } from "./TxList";

const EXAMPLES = ["奶茶 18", "打车回家 36", "淘宝买了个台灯 129", "昨天 份子钱 600"];

export function ExpensePage({ params, pageContext }: PluginPageProps) {
  const { pages } = useRuntime();
  const { today, time } = useNow();
  const current = monthOf(today);
  const [month, setMonth] = useState(current);
  const [day, setDay] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const query = useLedger(month, today);
  const addRef = useRef<HTMLDivElement>(null);

  // 跨月（页面一直开着过了月底）时回到新的本月
  const lastCurrent = useRef(current);
  useEffect(() => {
    if (lastCurrent.current === current) return;
    if (month === lastCurrent.current) {
      setMonth(current);
      setDay(null);
    }
    lastCurrent.current = current;
  }, [current, month]);

  const focusAdd = params.add === true;
  const ready = query.data != null;
  useEffect(() => {
    if (!focusAdd || !ready) return;
    addRef.current?.querySelector("input")?.focus();
    void pages.main?.open({});
  }, [focusAdd, ready, pages]);

  const derived = useMemo(() => {
    const d = query.data;
    if (!d) return null;
    // 只能翻到近 6 个月：再往前读不到完整的前 3 个月基准
    const earliest = addMonths(current, -(CHART_MONTHS - 1));
    return {
      nowStat: d.now ?? d.stat,
      chartMonths: d.history.slice(-CHART_MONTHS),
      weekday: weekdayAverages(d.txs, addDays(today, -90), addDays(today, -1)),
      lastSame: samePeriodTotal(d.txs, today),
      todayTxs: d.txs.filter(t => t.date === today),
      yesterday: d.txs.filter(t => t.date === addDays(today, -1) && t.recurringId == null).reduce((s, t) => s + t.cents, 0),
      earliest,
    };
  }, [query.data, today, current]);

  // 切月份时 placeholderData 还是上个月的，这期间不渲染也不上报
  const settled = query.data != null && query.data.stat.month === month;

  // 告诉 AI 对话当前在看哪个月、筛了什么
  useEffect(() => {
    const d = query.data;
    if (!d || d.stat.month !== month) return;
    const registration = pageContext.register(() => ({
      month,
      day,
      category: category ? (d.config.categories.find(c => c.id === category)?.name ?? category) : null,
      spentYuan: d.stat.total / 100,
      budgetYuan: d.stat.budget / 100,
    }));
    return () => void registration.dispose();
  }, [pageContext, query.data, month, day, category]);

  if (query.isError) return <div className="ex:text-ink-3 ex:grid ex:h-full ex:place-items-center ex:text-[13px]">记录读取失败</div>;
  if (!query.data || !derived || !settled) return <Loading />;
  const { stat, config, txs } = query.data;
  const { nowStat } = derived;
  const isNow = month === current;
  const filterCat = category ? config.categories.find(c => c.id === category) : null;

  const goMonth = (next: string) => {
    setMonth(next);
    setDay(null);
  };
  const openSettings = () => void pages.settings?.open();
  const stamp = `${month}|${stat.total}|${txs.length}`;

  return (
    <div className="ex:@container ex:h-full ex:overflow-y-auto ex:px-1 ex:pt-0.5 ex:pb-6">
      <div className="ex:grid ex:grid-cols-1 ex:gap-3.5 ex:@[1040px]:grid-cols-[minmax(0,1fr)_344px]">
        <div className="ex:flex ex:min-w-0 ex:flex-col ex:gap-3.5">
          <Summary stat={nowStat} todayTxs={derived.todayTxs} yesterday={derived.yesterday} lastSame={derived.lastSame} onSetup={openSettings} />

          <Card>
            <header className="ex:flex ex:flex-wrap ex:items-center ex:gap-1.5 ex:px-[18px] ex:pt-3.5">
              <IconButton aria-label="上个月" disabled={month <= derived.earliest} onClick={() => goMonth(addMonths(month, -1))}>
                <ChevronLeft className="ex:size-4" strokeWidth={1.75} />
              </IconButton>
              <h2 className="ex:mx-1 ex:text-[14.5px] ex:font-semibold ex:tabular-nums">
                {month.slice(0, 4)} 年 {monthLabel(month)}
              </h2>
              <IconButton aria-label="下个月" disabled={isNow} onClick={() => goMonth(addMonths(month, 1))}>
                <ChevronRight className="ex:size-4" strokeWidth={1.75} />
              </IconButton>
              {!isNow && (
                <Button size="sm" variant="ghost" onClick={() => goMonth(current)}>
                  回到本月
                </Button>
              )}
              <span className="ex:text-ink-3 ex:ml-1.5 ex:text-[11.5px]">
                {filterCat ? `只看${filterCat.name}` : `可控 ${yuan(stat.flex)} · 固定 ${yuan(stat.fixed)}`}
              </span>
            </header>
            <MonthCalendar
              stat={stat}
              categories={config.categories}
              today={today}
              selectedDay={day}
              selectedCategory={category}
              onPickDay={date => setDay(day === date ? null : date)}
            />
            <CalendarLegend filterName={filterCat?.name ?? null} allowance={filterCat ? filterCat.budget / stat.days : stat.allowance} />
          </Card>

          <Card>
            <CardHead title={`${monthLabel(month)}分类预算`} note={`${isNow ? "竖线 = 时间进度 · " : ""}点一类，日历和流水只看它`}>
              <Button size="sm" variant="ghost" icon={SlidersHorizontal} onClick={openSettings}>
                调整预算
              </Button>
            </CardHead>
            <CategoryBudgets stat={stat} categories={config.categories} selected={category} onPick={id => setCategory(category === id ? null : id)} />
          </Card>

          <Review
            months={derived.chartMonths}
            categories={config.categories}
            budget={stat.budget}
            selected={month}
            current={current}
            onPickMonth={goMonth}
            weekday={derived.weekday}
          />
        </div>

        <div className="ex:flex ex:min-w-0 ex:flex-col ex:gap-3.5">
          <Card className="ex:px-4 ex:pt-3.5 ex:pb-3">
            <div className="ex:text-ink-3 ex:mb-2.5 ex:flex ex:items-center ex:text-[12px]">
              一句话记账
              <span className="ex:flex-1" />
              {dayLabel(today)} {time}
            </div>
            <div ref={addRef}>
              <QuickAdd today={today} time={time} config={config} stat={nowStat} examples={EXAMPLES} />
            </div>
          </Card>
          <TxList
            className="ex:flex-1"
            txs={txs}
            categories={config.categories}
            month={month}
            today={today}
            day={day}
            category={category}
            onClearDay={() => setDay(null)}
            onClearCategory={() => setCategory(null)}
          />
          <AIPanel stamp={stamp} input={{ today, now: time, config, stat, history: query.data.history, txs }} />
        </div>
      </div>
    </div>
  );
}

function CalendarLegend({ filterName, allowance }: { filterName: string | null; allowance: number }) {
  const item = "ex:inline-flex ex:items-center ex:gap-1.5";
  return (
    <div className="ex:text-ink-3 ex:flex ex:flex-wrap ex:gap-x-3.5 ex:gap-y-1 ex:px-[18px] ex:pt-2 ex:pb-3.5 ex:text-[11px]">
      <span className={item}>
        <i className="ex:flex ex:h-1.5 ex:w-[22px] ex:gap-0.5">
          <i className="ex:block ex:h-full ex:w-3 ex:rounded-l-[3px]" style={{ background: categoryColor(0) }} />
          <i className="ex:block ex:h-full ex:flex-1 ex:rounded-r-[3px]" style={{ background: categoryColor(1) }} />
        </i>
        条 = 当天支出的分类构成
      </span>
      {allowance > 0 && (
        <span>
          满半格 = 日均额度 {yuan(allowance)}
          {filterName ? `（${filterName}）` : ""}，超过显示红字
        </span>
      )}
      {!filterName && (
        <span className={item}>
          <i className="ex:bg-ink-3 ex:size-[5px] ex:rounded-full" />
          有固定支出（不计入）
        </span>
      )}
    </div>
  );
}
