/**
 * 分类的二级页：全部分类（排序同主页）与单个分类详情（已用 / 预算、比平时多花多少、按备注合并、本月流水）。
 * 详情页右上进只看这一类的月历。
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, SlidersHorizontal } from "lucide-react";
import { cn } from "@tau/ui";
import type { Category, Tx } from "../../data/model";
import { isFixed, topNotes, type MonthStat } from "../../data/stats";
import { useRuntime } from "../../runtime";
import { categoryColor, monthLabel, yuan } from "../bits";
import { removeWithUndo } from "./actions";
import { CategoryRow, SwipeRow, TxRow, sortCategories } from "./HomeCards";
import { Bar, CardTitle, CatIcon, MCard, PrimaryButton } from "./parts";
import { TxSheet } from "./TxSheet";

export function CategoriesView({ stat, categories }: { stat: MonthStat; categories: readonly Category[] }) {
  const { pages } = useRuntime();
  const list = sortCategories(stat);
  return (
    <div className="ex:flex ex:flex-col ex:gap-3 ex:pt-1 ex:pb-6">
      <MCard className="ex:py-3">
        <div className="ex:text-ink-3 ex:flex ex:text-[12px]">
          <span>
            {monthLabel(stat.month)} · 已用 {yuan(stat.total)}
            {stat.budget > 0 ? ` / ${yuan(stat.budget)}` : ""}
          </span>
          <span className="ex:flex-1" />
          {stat.live && <span>竖线 = 时间进度 {Math.round(stat.pace * 100)}%</span>}
        </div>
      </MCard>
      <MCard className="ex:pb-1.5">
        <div className="ex:divide-line-2 ex:divide-y">
          {list.map(c => (
            <CategoryRow key={c.id} c={c} category={categories.find(x => x.id === c.id)} stat={stat} onClick={() => void pages.category?.open({ id: c.id })} />
          ))}
        </div>
      </MCard>
      <PrimaryButton ghost onClick={() => void pages.settings?.open()}>
        <SlidersHorizontal />
        调整预算
      </PrimaryButton>
    </div>
  );
}

export function CategoryDetail({
  id,
  stat,
  categories,
  txs,
  today,
  spentOf,
}: {
  id: string;
  stat: MonthStat;
  categories: readonly Category[];
  /** 本月流水 */
  txs: readonly Tx[];
  today: string;
  spentOf(category: string, month: string): number;
}) {
  const runtime = useRuntime();
  const client = useQueryClient();
  const [editing, setEditing] = useState<Tx | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const category = categories.find(c => c.id === id);
  const c = stat.categories.find(x => x.id === id);
  if (!category || !c) return <p className="ex:text-ink-3 ex:py-10 ex:text-center ex:text-[13px]">这个分类已经删除</p>;
  const list = txs.filter(t => t.category === id).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const notes = topNotes(list.filter(t => !isFixed(t)), 6);
  const maxNote = Math.max(1, ...notes.map(n => n.cents));
  const diff = c.average == null ? null : c.spent - c.average;
  const over = c.budget > 0 && c.spent > c.budget;

  return (
    <div className="ex:flex ex:flex-col ex:gap-3 ex:pt-1 ex:pb-6">
      <MCard>
        <div className="ex:flex ex:items-center ex:gap-2.5">
          <CatIcon category={category} size={38} />
          <div className="ex:min-w-0 ex:flex-1">
            <div className="ex:text-ink-3 ex:text-[12px]">{monthLabel(stat.month)}已用</div>
            <div className="ex:flex ex:items-baseline ex:gap-1.5">
              <b className={cn("ex:text-[26px] ex:font-[750] ex:tabular-nums", over && "ex:text-danger")}>{yuan(c.spent)}</b>
              {c.budget > 0 && <span className="ex:text-ink-3 ex:text-[12.5px] ex:tabular-nums">/ {yuan(c.budget)}</span>}
            </div>
          </div>
          {c.status !== "ok" && (
            <span className={cn("ex:rounded-full ex:px-2 ex:py-0.5 ex:text-[11.5px] ex:font-semibold", over ? "ex:bg-danger-soft ex:text-danger" : "ex:bg-warn-soft ex:text-warn")}>
              {over ? `超 ${yuan(c.spent - c.budget)}` : "偏快"}
            </span>
          )}
        </div>
        {c.budget > 0 && <Bar className="ex:mt-3 ex:mb-2" ratio={c.spent / c.budget} pace={c.fixedOnly || !stat.live ? null : stat.pace} danger={over} />}
        <div className="ex:text-ink-2 ex:flex ex:text-[12px]">
          {c.average == null ? (
            <span className="ex:text-ink-3">前几个月没有记录，还没有「平时」可比</span>
          ) : (
            <>
              <span>
                前 3 个月平均 <b className="ex:text-ink-1 ex:tabular-nums">{yuan(c.average)}</b>
              </span>
              <span className="ex:flex-1" />
              {diff != null && Math.abs(diff) >= 3000 ? (
                <span className={cn("ex:font-[650]", diff > 0 ? "ex:text-danger" : "ex:text-ok")}>
                  {diff > 0 ? "多花" : "少花"} {yuan(Math.abs(diff))}
                </span>
              ) : (
                <span className="ex:text-ink-3">和平时差不多</span>
              )}
            </>
          )}
        </div>
      </MCard>
      {notes.length > 0 && (
        <MCard className="ex:pb-2">
          <CardTitle title="花在哪" note="按备注合并" />
          {notes.map(n => (
            <div key={n.note} className="ex:grid ex:h-10 ex:grid-cols-[96px_1fr_64px] ex:items-center ex:gap-2">
              <span className="ex:truncate ex:text-[13px]">
                {n.note}
                {n.count > 1 && <small className="ex:text-ink-3 ex:ml-1 ex:text-[10.5px]">{n.count} 笔</small>}
              </span>
              <span className="ex:bg-track ex:block ex:h-1.5 ex:overflow-hidden ex:rounded-full">
                <i className="ex:block ex:h-full ex:rounded-full" style={{ width: `${(n.cents / maxNote) * 100}%`, background: categoryColor(category.color) }} />
              </span>
              <b className="ex:text-right ex:text-[13px] ex:font-[650] ex:tabular-nums">{yuan(n.cents)}</b>
            </div>
          ))}
        </MCard>
      )}
      <MCard className="ex:pb-1">
        <CardTitle title="流水" note={`${list.length} 笔`}>
          <button
            type="button"
            onClick={() => void runtime.pages.calendar?.open({ category: id })}
            className="ex:text-ink-3 ex:-mr-1 ex:flex ex:h-7 ex:items-center ex:gap-1 ex:px-1 ex:text-[12px] ex:font-medium"
          >
            <CalendarDays className="ex:size-3.5" />
            在月历里看
          </button>
        </CardTitle>
        <div className="ex:divide-line-2 ex:divide-y">
          {list.map(tx => (
            <SwipeRow
              key={tx.id}
              open={opened === tx.id}
              onOpen={next => setOpened(next ? tx.id : null)}
              onEdit={() => setEditing(tx)}
              onDelete={isFixed(tx) ? null : () => void removeWithUndo(runtime, client, tx)}
            >
              <TxRow
                tx={tx}
                category={category}
                onClick={() => (opened ? setOpened(null) : setEditing(tx))}
                sub={`${Number(tx.date.slice(5, 7))} 月 ${Number(tx.date.slice(8))} 日 · ${isFixed(tx) ? "固定支出" : tx.time}`}
              />
            </SwipeRow>
          ))}
          {!list.length && <p className="ex:text-ink-3 ex:py-5 ex:text-center ex:text-[12.5px]">这个月还没有花在这一类</p>}
        </div>
      </MCard>
      <TxSheet tx={editing} categories={categories} today={today} spentOf={spentOf} onClose={() => setEditing(null)} />
    </div>
  );
}
