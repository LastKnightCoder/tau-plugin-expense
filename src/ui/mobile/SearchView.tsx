/**
 * 搜索流水（二级页）：按备注搜，范围「近 6 个月 / 本月」，可再按分类收窄；顶部给合计与月均。
 * 只搜页面已读到的窗口（近 9 个月里的近 6 个月），不额外拉全表。
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { cn } from "@tau/ui";
import { addMonths, type Category, type Tx } from "../../data/model";
import { isFixed } from "../../data/stats";
import { useRuntime } from "../../runtime";
import { yuan } from "../bits";
import { CHART_MONTHS } from "../queries";
import { removeWithUndo } from "./actions";
import { TxCard } from "./HomeCards";
import { CatIcon, MCard } from "./parts";
import { TxSheet } from "./TxSheet";

type Range = "half" | "month";

export function SearchView({
  txs,
  categories,
  current,
  today,
  spentOf,
}: {
  txs: readonly Tx[];
  categories: readonly Category[];
  current: string;
  today: string;
  spentOf(category: string, month: string): number;
}) {
  const runtime = useRuntime();
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<Range>("half");
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [dayLimit, setDayLimit] = useState(30);
  const q = query.trim().toLowerCase();
  const from = range === "half" ? addMonths(current, -(CHART_MONTHS - 1)) : current;

  const result = useMemo(
    () => txs.filter(t => t.date.slice(0, 7) >= from && (!category || t.category === category) && (!q || t.note.toLowerCase().includes(q))),
    [txs, from, category, q]
  );
  const total = result.reduce((s, t) => s + t.cents, 0);
  const months = range === "half" ? CHART_MONTHS : 1;
  // 按备注搜时列出命中的分类，方便再收窄
  const hitCats = q ? categories.filter(c => result.some(t => t.category === c.id) || c.id === category) : categories;

  return (
    <div className="ex:flex ex:flex-col ex:gap-3 ex:pt-1 ex:pb-6">
      <label className="ex:bg-surface ex:shadow-card ex:flex ex:h-[46px] ex:items-center ex:gap-2 ex:rounded-[23px] ex:pr-1.5 ex:pl-4">
        <Search className="ex:text-ink-3 ex:size-[17px] ex:shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value.slice(0, 40))}
          enterKeyHint="search"
          placeholder="搜备注，比如「打车」"
          aria-label="搜索备注"
          className="ex:placeholder:text-ink-3 ex:min-w-0 ex:flex-1 ex:bg-transparent ex:text-[15px] ex:outline-none"
        />
        {query && (
          <button type="button" aria-label="清空" onClick={() => setQuery("")} className="ex:text-ink-3 ex:grid ex:size-8 ex:place-items-center">
            <X className="ex:size-4" />
          </button>
        )}
      </label>
      <div className="ex:scrollbar-none ex:-mx-4 ex:flex ex:gap-1.5 ex:overflow-x-auto ex:px-4" data-no-tab-swipe>
        {(
          [
            ["half", `近 ${CHART_MONTHS} 个月`],
            ["month", "本月"],
          ] as [Range, string][]
        ).map(([key, label]) => (
          <Chip key={key} on={range === key} onClick={() => setRange(key)}>
            {label}
          </Chip>
        ))}
        <span className="ex:bg-line-1 ex:mx-0.5 ex:w-px ex:shrink-0" />
        {hitCats.map(c => (
          <Chip key={c.id} on={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)} icon>
            <CatIcon category={c} size={20} />
            {c.name}
          </Chip>
        ))}
      </div>
      {(q || category) && (
        <MCard className="ex:py-3">
          <div className="ex:text-ink-3 ex:text-[12px]">
            {q ? `「${query.trim()}」` : ""}
            {category ? `${q ? " · " : ""}${categories.find(c => c.id === category)?.name ?? ""}` : ""} {range === "half" ? `近 ${CHART_MONTHS} 个月` : "本月"}
          </div>
          <div className="ex:mt-0.5 ex:flex ex:items-baseline ex:gap-2">
            <b className="ex:text-[24px] ex:font-[750] ex:tabular-nums">{yuan(total)}</b>
            <span className="ex:text-ink-3 ex:text-[12px]">
              {result.length} 笔{months > 1 && result.length ? ` · 平均每月 ${yuan(total / months)}` : ""}
              {result.some(isFixed) ? " · 含固定支出" : ""}
            </span>
          </div>
        </MCard>
      )}
      <TxCard
        title={q || category ? "结果" : "全部流水"}
        txs={result}
        categories={categories}
        today={today}
        dayLimit={dayLimit}
        onMore={() => setDayLimit(n => n + 30)}
        moreStep={30}
        onEdit={setEditing}
        onDelete={tx => void removeWithUndo(runtime, client, tx)}
        empty={<p className="ex:text-ink-3 ex:py-6 ex:text-center ex:text-[12.5px]">没有找到，换个说法试试</p>}
      />
      <TxSheet tx={editing} categories={categories} today={today} spentOf={spentOf} onClose={() => setEditing(null)} />
    </div>
  );
}

function Chip({ on, onClick, icon, children }: { on: boolean; onClick(): void; icon?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ex:flex ex:h-8 ex:shrink-0 ex:items-center ex:gap-1.5 ex:rounded-full ex:text-[12.5px]",
        icon ? "ex:pr-3 ex:pl-1.5" : "ex:px-3",
        on ? "ex:bg-ink-1 ex:text-ink-inverse" : "ex:bg-surface ex:text-ink-2 ex:shadow-[inset_0_0_0_1px_var(--tau-line-1)]"
      )}
    >
      {children}
    </button>
  );
}
