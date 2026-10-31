/**
 * 改一笔（底部面板）：大号金额 + 分类宫格 + 备注 + 日期时间。点金额切到面板数字键盘，「完成」回到完整面板。
 * 改了分类时记住这句备注；固定支出也能改金额与日期，删除要去设置里停掉规则，所以不给删除。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Repeat, Trash2 } from "lucide-react";
import { toast } from "@tau/ui";
import { formatYuan, parseYuan, type Category, type Tx } from "../../data/model";
import { EXPENSE_KEY, useRuntime } from "../../runtime";
import { dayLabel, yuan } from "../bits";
import { removeWithUndo } from "./actions";
import { AmountDisplay, AmountPad, CategoryGrid, PrimaryButton } from "./parts";
import { Sheet } from "./Sheet";

const FIELD = "ex:flex ex:min-h-[50px] ex:items-center ex:gap-2.5 ex:text-[14.5px]";

export function TxSheet({
  tx,
  categories,
  today,
  /** 改金额时提示这一类本月还剩多少 */
  spentOf,
  onClose,
}: {
  tx: Tx | null;
  categories: readonly Category[];
  today: string;
  spentOf(category: string, month: string): number;
  onClose(): void;
}) {
  const runtime = useRuntime();
  const client = useQueryClient();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [padding, setPadding] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!tx) return;
    setAmount(formatYuan(tx.cents).replace(/,/g, ""));
    setCategory(tx.category);
    setNote(tx.note);
    setDate(tx.date);
    setTime(tx.time);
    setPadding(false);
  }, [tx]);

  const cents = parseYuan(amount);
  const cat = categories.find(c => c.id === category) ?? null;
  const valid = tx != null && cents != null && cat != null && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
  const fixed = tx?.recurringId != null;

  const save = async () => {
    if (!tx || !valid || saving) return;
    setSaving(true);
    try {
      await runtime.data.updateTx(tx, {
        cents: cents!,
        category,
        note: note.trim().slice(0, 200),
        date,
        time: /^\d{2}:\d{2}$/.test(time) ? time : tx.time,
      });
      if (category !== tx.category && note.trim()) await runtime.data.rememberAlias(note, category).catch(() => undefined);
      await client.invalidateQueries({ queryKey: EXPENSE_KEY });
      onClose();
    } catch {
      toast.error("保存失败，可能在别处被改过，刷新后再试");
    } finally {
      setSaving(false);
    }
  };

  const left = cat && cat.budget > 0 && cents != null && tx ? cat.budget - spentOf(cat.id, date.slice(0, 7)) + (tx.category === cat.id && tx.date.slice(0, 7) === date.slice(0, 7) ? tx.cents : 0) - cents : null;

  return (
    <Sheet
      open={tx != null}
      onClose={onClose}
      title="改一笔"
      subtitle={padding ? [note.trim(), cat?.name].filter(Boolean).join(" · ") : undefined}
      trailing={
        padding ? (
          <button type="button" onClick={() => setPadding(false)} className="ex:text-accent-text ex:h-8 ex:px-1 ex:text-[13.5px] ex:font-semibold">
            完成
          </button>
        ) : tx && !fixed ? (
          <button
            type="button"
            aria-label="删除这一笔"
            onClick={() => {
              onClose();
              void removeWithUndo(runtime, client, tx);
            }}
            className="ex:text-danger ex:grid ex:size-8 ex:place-items-center"
          >
            <Trash2 className="ex:size-[18px]" />
          </button>
        ) : null
      }
    >
      <button type="button" className="ex:block ex:w-full" onClick={() => setPadding(true)} aria-label="改金额">
        <AmountDisplay value={amount} caret={padding} />
      </button>
      {padding ? (
        <>
          <p className="ex:text-ink-3 ex:mb-3 ex:text-center ex:text-[12px]">
            原来 {tx ? yuan(tx.cents) : ""}
            {left != null && cat && (
              <>
                {" "}
                · {cat.name}
                {left < 0 ? `会超 ${yuan(-left)}` : `还剩 ${yuan(left)}`}
              </>
            )}
          </p>
          <AmountPad value={amount} onChange={setAmount} />
        </>
      ) : (
        <>
          <CategoryGrid categories={categories} value={category} onChange={setCategory} />
          <div className="ex:divide-line-2 ex:divide-y">
            <label className={FIELD}>
              <span className="ex:text-ink-3 ex:w-11 ex:shrink-0">备注</span>
              <input
                value={note}
                onChange={e => setNote(e.target.value.slice(0, 200))}
                placeholder="可不填"
                className="ex:placeholder:text-ink-3 ex:min-w-0 ex:flex-1 ex:bg-transparent ex:outline-none"
              />
            </label>
            <label className={FIELD}>
              <span className="ex:text-ink-3 ex:w-11 ex:shrink-0">日期</span>
              <span className="ex:relative ex:flex ex:flex-1 ex:items-center ex:gap-1">
                {date ? dayLabel(date, today) : ""}
                <ChevronRight className="ex:text-ink-3 ex:ml-auto ex:size-4" />
                <input
                  type="date"
                  value={date}
                  max={today}
                  onChange={e => e.target.value && setDate(e.target.value)}
                  aria-label="日期"
                  className="ex:absolute ex:inset-0 ex:opacity-0"
                />
              </span>
            </label>
            {!fixed && (
              <label className={FIELD}>
                <span className="ex:text-ink-3 ex:w-11 ex:shrink-0">时间</span>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} className="ex:min-w-0 ex:flex-1 ex:bg-transparent ex:outline-none" />
              </label>
            )}
          </div>
          <p className="ex:text-ink-3 ex:flex ex:items-center ex:gap-1 ex:px-1 ex:pt-1.5 ex:text-[11.5px] ex:leading-[1.6]">
            {fixed ? (
              <>
                <Repeat className="ex:size-3" />
                这是自动记入的固定支出，停掉要去设置里删除规则
              </>
            ) : tx && category !== tx.category && note.trim() ? (
              `以后写「${note.trim()}」会自动归到${cat?.name ?? "这一类"}`
            ) : null}
          </p>
        </>
      )}
      <PrimaryButton className="ex:mt-2" disabled={!valid || saving} onClick={() => void save()}>
        保存
      </PrimaryButton>
    </Sheet>
  );
}
