/**
 * 手机主页的卡片：主卡（本月还能花 + 时间进度 + 今天 / 昨天 / 比上月同期）、分类预算、按天分组的流水。
 * 流水左滑露出「改 / 删除」（固定支出只有「改」），点按打开编辑面板。
 */
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronRight, Pencil, Repeat, Search, SlidersHorizontal, Trash2, Wallet } from "lucide-react";
import { cn } from "@tau/ui";
import type { Category, Tx } from "../../data/model";
import { dailyRoom, isFixed, type CategoryStat, type MonthStat } from "../../data/stats";
import { dayLabel, monthLabel, yuan } from "../bits";
import { Bar, CardTitle, CatIcon, MCard } from "./parts";

export function HeroCard({
  stat,
  today,
  yesterday,
  lastSame,
  topDiff,
}: {
  stat: MonthStat;
  /** 今天的可控支出与笔数 */
  today: { cents: number; count: number };
  yesterday: number;
  lastSame: { month: string; total: number };
  /** 比上月同期多出最多的分类 */
  topDiff: { name: string; cents: number } | null;
}) {
  const left = stat.budget - stat.total;
  const fast = stat.budget > 0 && (left < 0 || stat.paceRatio > stat.pace);
  const perDay = dailyRoom(stat);
  const diff = stat.total - lastSame.total;
  return (
    <MCard>
      <div className="ex:text-ink-3 ex:flex ex:items-center ex:gap-1.5 ex:text-[12px]">
        <Wallet className="ex:size-[13px]" />
        {stat.budget > 0 ? `${monthLabel(stat.month)}${left < 0 ? "已超预算" : "还能花"} · 剩 ${stat.daysLeft} 天` : `${monthLabel(stat.month)}已花`}
      </div>
      <div className="ex:my-1.5 ex:flex ex:flex-wrap ex:items-center ex:gap-2">
        <b className={cn("ex:text-[34px] ex:leading-none ex:font-[750] ex:tracking-[-0.03em] ex:tabular-nums", left < 0 && stat.budget > 0 && "ex:text-danger")}>
          {stat.budget > 0 ? `${left < 0 ? "−" : ""}${yuan(Math.abs(left))}` : yuan(stat.total)}
        </b>
        {stat.budget > 0 && (
          <span
            className={cn(
              "ex:inline-flex ex:h-[22px] ex:items-center ex:gap-[3px] ex:rounded-full ex:px-2 ex:text-[11.5px] ex:font-semibold",
              fast ? "ex:bg-danger-soft ex:text-danger" : "ex:bg-ok-soft ex:text-ok"
            )}
          >
            {fast ? <AlertTriangle className="ex:size-3" /> : <Check className="ex:size-3" />}
            {left < 0 ? "已超预算" : fast ? `比时间进度快 ${Math.round((stat.paceRatio - stat.pace) * 100)}%` : "节奏正常"}
          </span>
        )}
      </div>
      {stat.budget > 0 && (
        <>
          <Bar className="ex:mt-2.5" ratio={stat.total / stat.budget} pace={stat.pace} danger={fast} />
          <div className="ex:text-ink-3 ex:mt-2 ex:flex ex:text-[11.5px]">
            <span>
              已花 <b className="ex:text-ink-1 ex:font-[650] ex:tabular-nums">{yuan(stat.total)}</b> / {yuan(stat.budget)}
            </span>
            <span className="ex:flex-1" />
            {left > 0 ? (
              <span>
                剩下每天最多 <b className="ex:text-ink-1 ex:font-[650] ex:tabular-nums">{yuan(perDay)}</b>
              </span>
            ) : (
              <span>剩下的天尽量只花必要的</span>
            )}
          </div>
        </>
      )}
      <div className="ex:mt-3 ex:grid ex:grid-cols-3 ex:gap-2">
        <Tile label="今天" value={yuan(today.cents)} note={`${today.count} 笔`} />
        <Tile label="昨天" value={yuan(yesterday)} note={stat.allowance > 0 ? `日均额度 ${yuan(stat.allowance)}` : null} />
        <Tile
          label={`比${monthLabel(lastSame.month)}同期`}
          value={lastSame.total > 0 ? `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${yuan(Math.abs(diff)).slice(1)}` : "—"}
          tone={lastSame.total > 0 && Math.abs(diff) >= 3000 ? (diff > 0 ? "up" : "down") : null}
          note={lastSame.total > 0 ? (topDiff && diff > 0 ? `${topDiff.name}多了 ${yuan(topDiff.cents)}` : `同期 ${yuan(lastSame.total)}`) : "上月没有记录"}
        />
      </div>
    </MCard>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: ReactNode; tone?: "up" | "down" | null }) {
  return (
    <div className="ex:bg-hover ex:flex ex:min-w-0 ex:flex-col ex:gap-px ex:rounded-[12px] ex:px-2.5 ex:py-2">
      <span className="ex:text-ink-3 ex:truncate ex:text-[11px]">{label}</span>
      <b className={cn("ex:truncate ex:text-[16px] ex:font-bold ex:tabular-nums", tone === "up" && "ex:text-danger", tone === "down" && "ex:text-ok")}>{value}</b>
      <small className="ex:text-ink-3 ex:truncate ex:text-[10.5px]">{note}</small>
    </div>
  );
}

/** 吸顶的一行余额：主卡滚出屏幕后显示 */
export function MiniHero({ stat, today }: { stat: MonthStat; today: number }) {
  const left = stat.budget - stat.total;
  return (
    <div className="ex:bg-surface ex:shadow-card ex:flex ex:items-center ex:gap-2.5 ex:rounded-[16px] ex:px-3.5 ex:py-2.5 ex:text-[13px]">
      <Wallet className="ex:text-accent ex:size-[15px]" />
      {stat.budget > 0 ? (
        <>
          {left < 0 ? "已超" : "还能花"} <b className={cn("ex:text-[17px] ex:tabular-nums", left < 0 && "ex:text-danger")}>{yuan(Math.abs(left))}</b>
          <span className="ex:flex-1" />
          <span className="ex:text-ink-3">{left > 0 ? `每天最多 ${yuan(dailyRoom(stat))}` : `今天 ${yuan(today)}`}</span>
        </>
      ) : (
        <>
          本月已花 <b className="ex:text-[17px] ex:tabular-nums">{yuan(stat.total)}</b>
          <span className="ex:flex-1" />
          <span className="ex:text-ink-3">今天 {yuan(today)}</span>
        </>
      )}
    </div>
  );
}

const RANK: Record<CategoryStat["status"], number> = { over: 0, fast: 1, ok: 2 };

/** 超了 → 偏快 → 用掉的比例；没设预算的排最后 */
export function sortCategories(stat: MonthStat): CategoryStat[] {
  return [...stat.categories].sort((a, b) => {
    if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status];
    const ra = a.budget > 0 ? a.spent / a.budget : -1;
    const rb = b.budget > 0 ? b.spent / b.budget : -1;
    return rb - ra || b.spent - a.spent;
  });
}

export function CategoryRow({ c, category, stat, onClick, selected }: { c: CategoryStat; category: Category | undefined; stat: MonthStat; onClick(): void; selected?: boolean }) {
  const diff = c.average == null ? null : c.spent - c.average;
  const tag =
    c.status === "over" ? (
      <span className="ex:text-danger">超 {yuan(c.spent - c.budget)}</span>
    ) : c.status === "fast" ? (
      <span className="ex:text-warn">偏快</span>
    ) : diff == null || Math.abs(diff) < 3000 ? (
      <span className="ex:text-ink-3">{diff == null ? "—" : "持平"}</span>
    ) : (
      <span className={diff > 0 ? "ex:text-danger" : "ex:text-ok"}>
        {diff > 0 ? "+" : "−"}
        {yuan(Math.abs(diff)).slice(1)}
      </span>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("ex:flex ex:h-[52px] ex:w-full ex:items-center ex:gap-2.5 ex:text-left ex:active:bg-press", selected && "ex:bg-press ex:-mx-2 ex:w-[calc(100%+16px)] ex:rounded-[12px] ex:px-2")}
    >
      <CatIcon category={category ?? null} />
      <span className="ex:flex ex:min-w-0 ex:flex-1 ex:flex-col ex:gap-1.5">
        <span className="ex:flex ex:items-baseline ex:gap-1 ex:text-[13.5px]">
          <span className="ex:truncate">{category?.name ?? "已删除分类"}</span>
          {c.fixedOnly && (
            <small className="ex:text-ink-3 ex:ml-1.5 ex:inline-flex ex:shrink-0 ex:items-center ex:gap-0.5 ex:text-[10.5px]">
              <Repeat className="ex:size-2.5" />
              固定
            </small>
          )}
          <span className="ex:flex-1" />
          <b className="ex:font-[650] ex:tabular-nums">{yuan(c.spent)}</b>
          {c.budget > 0 && <span className="ex:text-ink-3 ex:text-[11px] ex:tabular-nums">/ {yuan(c.budget).slice(1)}</span>}
        </span>
        {c.budget > 0 ? (
          <Bar className="ex:h-1.5" ratio={c.spent / c.budget} pace={c.fixedOnly || !stat.live ? null : stat.pace} danger={c.status === "over"} />
        ) : (
          <span className="ex:text-ink-3 ex:text-[10.5px] ex:leading-[6px]">不设预算</span>
        )}
      </span>
      <span className="ex:w-[54px] ex:shrink-0 ex:text-right ex:text-[11.5px] ex:font-semibold ex:tabular-nums">{tag}</span>
    </button>
  );
}

export function CategoryCard({
  stat,
  categories,
  limit,
  onOpen,
  onOpenAll,
}: {
  stat: MonthStat;
  categories: readonly Category[];
  limit: number;
  onOpen(id: string): void;
  onOpenAll(): void;
}) {
  const list = sortCategories(stat).filter(c => c.spent > 0 || c.budget > 0);
  return (
    <MCard className="ex:pb-1.5">
      <CardTitle title="分类预算" note={stat.live ? "竖线 = 时间进度" : undefined}>
        <button type="button" onClick={onOpenAll} className="ex:text-ink-3 ex:-mr-1 ex:flex ex:h-7 ex:items-center ex:gap-0.5 ex:px-1 ex:text-[12px] ex:font-medium">
          {list.length > limit ? `全部 ${list.length} 类` : <SlidersHorizontal className="ex:size-3.5" />}
          {list.length > limit && <ChevronRight className="ex:size-[13px]" />}
        </button>
      </CardTitle>
      <div className="ex:divide-line-2 ex:divide-y">
        {list.slice(0, limit).map(c => (
          <CategoryRow key={c.id} c={c} category={categories.find(x => x.id === c.id)} stat={stat} onClick={() => onOpen(c.id)} />
        ))}
      </div>
    </MCard>
  );
}

const PAGE_DAYS = 7;

/** 按天分组的流水；days 控制显示到第几天，滚到底时由页面加大 */
export function TxCard({
  title = "流水",
  note,
  txs,
  categories,
  today,
  dayLimit,
  onMore,
  onEdit,
  onDelete,
  onSearch,
  highlight,
  empty,
  moreStep = PAGE_DAYS,
}: {
  /** 「再看 N 天」每次多显示的天数，与调用方 onMore 的步长一致 */
  moreStep?: number;
  title?: ReactNode;
  note?: ReactNode;
  txs: readonly Tx[];
  categories: readonly Category[];
  today: string;
  dayLimit?: number;
  onMore?(): void;
  onEdit(tx: Tx): void;
  onDelete(tx: Tx): void;
  onSearch?(): void;
  highlight?: string | null;
  empty?: ReactNode;
}) {
  const [opened, setOpened] = useState<string | null>(null);
  const groups = groupByDay(txs);
  const shown = dayLimit != null ? groups.slice(0, dayLimit) : groups;
  return (
    <MCard className="ex:pb-1">
      <CardTitle title={title} note={note}>
        {onSearch && (
          <button type="button" aria-label="搜索流水" onClick={onSearch} className="ex:text-ink-3 ex:-mr-1 ex:grid ex:size-7 ex:place-items-center">
            <Search className="ex:size-3.5" />
          </button>
        )}
      </CardTitle>
      {shown.map(([date, list]) => (
        <div key={date}>
          <div className="ex:text-ink-3 ex:flex ex:pt-2 ex:pb-0.5 ex:text-[11.5px] ex:font-semibold">
            <span>{dayLabel(date, today)}</span>
            <span className="ex:flex-1" />
            <span className="ex:tabular-nums">{yuan(list.filter(t => !isFixed(t)).reduce((s, t) => s + t.cents, 0))}</span>
          </div>
          <div className="ex:divide-line-2 ex:divide-y">
            {list.map(tx => (
              <SwipeRow
                key={tx.id}
                open={opened === tx.id}
                onOpen={next => setOpened(next ? tx.id : null)}
                onEdit={() => onEdit(tx)}
                onDelete={isFixed(tx) ? null : () => onDelete(tx)}
              >
                <TxRow tx={tx} category={categories.find(c => c.id === tx.category)} highlighted={highlight === tx.id} onClick={() => (opened ? setOpened(null) : onEdit(tx))} />
              </SwipeRow>
            ))}
          </div>
        </div>
      ))}
      {!shown.length && (empty ?? <p className="ex:text-ink-3 ex:py-5 ex:text-center ex:text-[12.5px]">没有流水</p>)}
      {onMore && dayLimit != null && groups.length > dayLimit && (
        <button type="button" onClick={onMore} className="ex:text-ink-3 ex:h-10 ex:w-full ex:text-[12.5px]">
          再看 {Math.min(moreStep, groups.length - dayLimit)} 天
        </button>
      )}
    </MCard>
  );
}

export const MORE_DAYS = PAGE_DAYS;

/** 倒序按天分组，同一天里新的在前 */
export function groupByDay(txs: readonly Tx[]): [string, Tx[]][] {
  const map = new Map<string, Tx[]>();
  for (const tx of [...txs].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))) {
    const list = map.get(tx.date) ?? [];
    list.push(tx);
    map.set(tx.date, list);
  }
  return [...map.entries()];
}

export function TxRow({ tx, category, highlighted, onClick, sub }: { tx: Tx; category: Category | undefined; highlighted?: boolean; onClick(): void; sub?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ex:bg-surface ex:flex ex:h-[52px] ex:w-full ex:items-center ex:gap-2.5 ex:text-left ex:transition-colors ex:duration-700",
        highlighted && "ex:bg-press"
      )}
    >
      <CatIcon category={category ?? null} />
      <span className="ex:min-w-0 ex:flex-1">
        <span className="ex:block ex:truncate ex:text-[14px]">{tx.note || category?.name || "未分类"}</span>
        <small className="ex:text-ink-3 ex:flex ex:items-center ex:gap-1 ex:text-[11px]">
          {sub ?? (
            <>
              {isFixed(tx) ? (
                <>
                  <Repeat className="ex:size-2.5" />
                  固定支出
                </>
              ) : (
                tx.time
              )}
              {` · ${category?.name ?? "已删除分类"}`}
            </>
          )}
        </small>
      </span>
      <span className="ex:text-[14px] ex:font-[650] ex:tabular-nums">{yuan(tx.cents)}</span>
    </button>
  );
}

const ACTION_W = 64;

/** 左滑露出「改 / 删除」；滑过一半松手直接删除。竖向滑动交给页面滚动 */
export function SwipeRow({
  open,
  onOpen,
  onEdit,
  onDelete,
  children,
}: {
  open: boolean;
  onOpen(open: boolean): void;
  onEdit(): void;
  /** 为 null 时只有「改」（固定支出） */
  onDelete: (() => void) | null;
  children: ReactNode;
}) {
  const actions = onDelete ? ACTION_W * 2 : ACTION_W;
  const [dx, setDx] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number; locked?: "x" | "y" } | null>(null);
  const width = useRef(0);
  const offset = dx ?? (open ? -actions : 0);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    width.current = e.currentTarget.offsetWidth;
    start.current = { x: e.clientX, y: e.clientY, base: open ? -actions : 0 };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.locked) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      s.locked = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (s.locked === "x") e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (s.locked !== "x") return;
    const min = onDelete ? -width.current : -actions;
    setDx(Math.min(0, Math.max(min, s.base + mx)));
  };
  const onUp = () => {
    const s = start.current;
    start.current = null;
    if (!s || s.locked !== "x" || dx == null) return setDx(null);
    const final = dx;
    setDx(null);
    if (onDelete && final < -width.current / 2) {
      onOpen(false);
      onDelete();
    } else onOpen(final < -actions / 2);
  };
  return (
    <div className="ex:relative ex:overflow-hidden" data-no-tab-swipe data-no-edge-back>
      <div className="ex:absolute ex:inset-y-0 ex:right-0 ex:flex" aria-hidden={!open}>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={() => {
            onOpen(false);
            onEdit();
          }}
          className="ex:bg-ink-3 ex:grid ex:w-16 ex:place-content-center ex:justify-items-center ex:gap-0.5 ex:text-[11px] ex:text-white"
        >
          <Pencil className="ex:size-[17px]" />改
        </button>
        {onDelete && (
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              onOpen(false);
              onDelete();
            }}
            className="ex:bg-danger ex:grid ex:w-16 ex:place-content-center ex:justify-items-center ex:gap-0.5 ex:text-[11px] ex:text-white"
            style={offset < -actions ? { width: -offset - ACTION_W } : undefined}
          >
            <Trash2 className="ex:size-[17px]" />删除
          </button>
        )}
      </div>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={cn("ex:relative ex:touch-pan-y", dx == null && "ex:transition-transform ex:duration-200 ex:ease-tau-out")}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
