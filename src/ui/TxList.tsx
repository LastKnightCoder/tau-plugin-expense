/**
 * 流水：按天分组倒序。范围由页面给出（月 → 选中的某天 → 选中的分类，逐级收窄），顶部的筛选标签可以单独取消；
 * 选了分类时列出备注聚合。点一笔打开编辑弹窗，删除给撤销。
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Repeat, Search, X } from "lucide-react";
import { IconButton, Input, toast } from "@tau/ui";
import { formatYuan, type Category, type Tx } from "../data/model";
import { isFixed, topNotes } from "../data/stats";
import { EXPENSE_KEY, useRuntime } from "../runtime";
import { Card, CardHead, CategoryIcon, dayLabel, monthLabel, yuan } from "./bits";
import { TxDialog } from "./TxDialog";

export function TxList({
  txs,
  categories,
  month,
  today,
  day,
  category,
  onClearDay,
  onClearCategory,
  className,
}: {
  txs: readonly Tx[];
  categories: readonly Category[];
  month: string;
  today: string;
  day: string | null;
  category: string | null;
  onClearDay(): void;
  onClearCategory(): void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const q = query.trim().toLowerCase();
  const list = txs
    .filter(t => t.date.startsWith(month) && (!day || t.date === day) && (!category || t.category === category))
    .filter(t => !q || t.note.toLowerCase().includes(q))
    .slice()
    .reverse();
  const total = list.reduce((s, t) => s + t.cents, 0);
  const cat = category ? categories.find(c => c.id === category) : null;
  const notes = cat ? topNotes(list, 6) : [];
  const groups: { date: string; items: Tx[] }[] = [];
  for (const t of list) {
    const last = groups[groups.length - 1];
    if (last?.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }

  return (
    <Card className={`ex:flex ex:min-h-0 ex:flex-col ${className ?? ""}`}>
      <CardHead title="流水">
        <IconButton aria-label={searching ? "关闭搜索" : "搜索备注"} onClick={() => (setSearching(!searching), setQuery(""))}>
          {searching ? <X className="ex:size-[15px]" strokeWidth={1.75} /> : <Search className="ex:size-[15px]" strokeWidth={1.75} />}
        </IconButton>
      </CardHead>
      {searching && (
        <div className="ex:px-4 ex:pt-1">
          <Input size="sm" autoFocus lead={Search} clearable value={query} onChange={e => setQuery(e.target.value)} placeholder="搜备注" aria-label="搜索备注" />
        </div>
      )}
      <div className="ex:flex ex:flex-wrap ex:gap-1.5 ex:px-[18px] ex:pt-1.5">
        <Chip>{monthLabel(month)}</Chip>
        {day && <Chip onClear={onClearDay}>{dayLabel(day, today)}</Chip>}
        {cat && (
          <Chip onClear={onClearCategory}>
            <CategoryIcon category={cat} size="sm" />
            {cat.name}
          </Chip>
        )}
      </div>
      <div className="ex:text-ink-3 ex:flex ex:items-baseline ex:gap-1.5 ex:px-[18px] ex:pt-2 ex:text-[12px]">
        <b className="ex:text-ink-1 ex:text-[16px] ex:font-semibold ex:tabular-nums">{yuan(total)}</b>
        {list.length} 笔
      </div>
      {notes.length > 1 && (
        <div className="ex:text-ink-2 ex:flex ex:flex-wrap ex:gap-x-3 ex:gap-y-1 ex:px-[18px] ex:pt-1.5 ex:text-[11.5px]">
          {notes.map(n => (
            <span key={n.note}>
              {n.note} <b className="ex:text-ink-1 ex:font-semibold ex:tabular-nums">{formatYuan(n.cents)}</b>
            </span>
          ))}
        </div>
      )}
      <div className="ex:flex ex:min-h-[240px] ex:flex-[1_1_0] ex:flex-col ex:overflow-y-auto ex:px-2.5 ex:pt-0.5 ex:pb-2.5">
        {groups.map(g => (
          <div key={g.date}>
            <div className="ex:text-ink-3 ex:flex ex:items-center ex:px-2 ex:pt-2.5 ex:pb-[3px] ex:text-[11.5px]">
              {dayLabel(g.date, today)}
              <b className="ex:text-ink-2 ex:ml-auto ex:font-medium ex:tabular-nums">{yuan(g.items.reduce((s, t) => s + t.cents, 0))}</b>
            </div>
            {g.items.map(t => (
              <Row key={t.id} tx={t} categories={categories} onEdit={() => setEditing(t)} />
            ))}
          </div>
        ))}
        {!list.length && (
          <p className="ex:text-ink-3 ex:px-2 ex:py-6 ex:text-center ex:text-[12px]">{q ? "没有找到" : day || cat ? "这里没有支出" : "这个月还没有记录，在上面写一句就能记下第一笔。"}</p>
        )}
      </div>
      <TxDialog tx={editing} categories={categories} onClose={() => setEditing(null)} />
    </Card>
  );
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear?: () => void }) {
  return (
    <span className="ex:bg-hover ex:text-ink-1 ex:inline-flex ex:h-[22px] ex:items-center ex:gap-1 ex:rounded-full ex:pr-1 ex:pl-2 ex:text-[11.5px]" style={onClear ? undefined : { paddingRight: 8 }}>
      {children}
      {onClear && (
        <button type="button" aria-label="取消筛选" onClick={onClear} className="ex:text-ink-3 ex:hover:bg-press ex:hover:text-ink-1 ex:grid ex:size-4 ex:place-items-center ex:rounded-full">
          <X className="ex:size-[11px]" strokeWidth={2} />
        </button>
      )}
    </span>
  );
}

function Row({ tx, categories, onEdit }: { tx: Tx; categories: readonly Category[]; onEdit(): void }) {
  const { data } = useRuntime();
  const client = useQueryClient();
  const cat = categories.find(c => c.id === tx.category) ?? { id: tx.category, name: "已删除分类", icon: "other", budget: 0, color: 6 };
  const remove = async () => {
    const refresh = () => client.invalidateQueries({ queryKey: EXPENSE_KEY });
    try {
      await data.deleteTx(tx);
      await refresh();
      const { id: _id, revision: _revision, ...input } = tx;
      toast.success(`已删除 ${tx.note || cat.name}`, {
        action: { label: "撤销", onClick: () => void data.addTx(input).then(refresh).catch(() => toast.error("撤销失败")) },
      });
    } catch {
      toast.error("删除失败");
    }
  };
  return (
    <div className="ex:group ex:hover:bg-hover ex:grid ex:grid-cols-[24px_minmax(0,1fr)_auto_26px] ex:items-center ex:gap-2.5 ex:rounded-[10px] ex:py-[5px] ex:pr-1 ex:pl-2 ex:text-[12.5px]">
      <CategoryIcon category={cat} />
      <button type="button" onClick={onEdit} className="ex:flex ex:min-w-0 ex:flex-col ex:text-left ex:leading-[1.35]" title="修改">
        <span className="ex:flex ex:min-w-0 ex:items-center ex:gap-1">
          <span className="ex:truncate">{tx.note || cat.name}</span>
          {isFixed(tx) && (
            <span className="ex:text-ink-3 ex:inline-flex ex:shrink-0 ex:items-center ex:gap-0.5 ex:rounded-[4px] ex:px-1 ex:text-[10.5px] ex:shadow-[inset_0_0_0_1px_var(--tau-line-1)]">
              <Repeat className="ex:size-2.5" strokeWidth={2} />
              固定
            </span>
          )}
        </span>
        <small className="ex:text-ink-3 ex:text-[11px]">
          {isFixed(tx) ? "自动记入" : tx.time} · {cat.name}
        </small>
      </button>
      <button type="button" onClick={onEdit} className="ex:font-semibold ex:tabular-nums">
        −{formatYuan(tx.cents)}
      </button>
      <IconButton aria-label={`删除 ${tx.note || cat.name}`} onClick={() => void remove()} className="ex:size-[26px] ex:opacity-0 ex:group-hover:opacity-100 ex:focus-visible:opacity-100">
        <X className="ex:size-[13px]" strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}
