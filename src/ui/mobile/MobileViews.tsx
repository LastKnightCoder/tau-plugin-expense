/**
 * 手机二级页的外壳：各页共用一份账本查询（近 9 个月），按 view 分出月历、全部分类、分类详情、回顾与 AI、搜索。
 * 每个 view 单独注册为插件页面，由宿主页面栈承载返回。
 */
import { useMemo, useState } from "react";
import type { PluginPageProps } from "@tau/plugins";
import { Loading } from "@tau/ui";
import { addDays, monthOf } from "../../data/model";
import { weekdayAverages } from "../../data/stats";
import { CHART_MONTHS, useLedger, useNow } from "../queries";
import { CalendarView } from "./CalendarView";
import { CategoriesView, CategoryDetail } from "./CategoryViews";
import { ReviewView } from "./ReviewView";
import { SearchView } from "./SearchView";
import { SheetHost } from "./Sheet";

export type MobileView = "calendar" | "categories" | "category" | "review" | "search";

export function MobileViews({ view, params, pageContext }: PluginPageProps & { view: MobileView }) {
  const { today, time } = useNow();
  const current = monthOf(today);
  const [month, setMonth] = useState(current);
  const [category, setCategory] = useState<string | null>(typeof params.category === "string" ? params.category : null);
  const query = useLedger(view === "calendar" ? month : current, today);

  const derived = useMemo(() => {
    const d = query.data;
    if (!d) return null;
    return {
      nowStat: d.now ?? d.stat,
      weekday: weekdayAverages(d.txs, addDays(today, -90), addDays(today, -1)),
      monthTxs: d.txs.filter(t => monthOf(t.date) === current),
    };
  }, [query.data, today, current]);

  if (query.isError) return <div className="ex:text-ink-3 ex:grid ex:h-60 ex:place-items-center ex:text-[13px]">记录读取失败</div>;
  // 翻月时 placeholderData 还是上个月的，这期间不渲染
  if (!query.data || !derived || (view === "calendar" && query.data.stat.month !== month)) return <Loading minHeight={240} />;
  const { stat, config, txs, history } = query.data;
  const spentOf = (id: string, m: string) => txs.filter(t => t.category === id && monthOf(t.date) === m).reduce((s, t) => s + t.cents, 0);

  const body = (() => {
    switch (view) {
      case "calendar":
        return (
          <CalendarView
            month={month}
            onMonth={setMonth}
            current={current}
            stat={stat}
            txs={txs.filter(t => monthOf(t.date) === month)}
            categories={config.categories}
            category={category}
            onClearCategory={() => setCategory(null)}
            today={today}
            spentOf={spentOf}
          />
        );
      case "categories":
        return <CategoriesView stat={derived.nowStat} categories={config.categories} />;
      case "category":
        return (
          <CategoryDetail
            id={typeof params.id === "string" ? params.id : ""}
            stat={derived.nowStat}
            categories={config.categories}
            txs={derived.monthTxs}
            today={today}
            spentOf={spentOf}
          />
        );
      case "review":
        return (
          <ReviewView
            months={history.slice(-CHART_MONTHS)}
            categories={config.categories}
            budget={derived.nowStat.budget}
            current={current}
            weekday={derived.weekday}
            aiInput={{ today, now: time, config, stat: derived.nowStat, history, txs }}
            stamp={`${current}|${derived.nowStat.total}|${txs.length}`}
          />
        );
      case "search":
        return <SearchView txs={txs} categories={config.categories} current={current} today={today} spentOf={spentOf} />;
    }
  })();
  return <SheetHost.Provider value={pageContext}>{body}</SheetHost.Provider>;
}
