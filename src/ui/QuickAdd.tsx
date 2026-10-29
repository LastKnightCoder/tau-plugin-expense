/**
 * 一句话记账：输入「午饭 牛肉面 28」，即时识别金额和分类，预览记下后这个分类和本月还剩多少，回车记下。
 * 认不出分类时让用户点一下，也可以点「AI 归类」；保存时记住这句备注对应的分类，下次自动带出。
 * 页面与首页卡片共用。
 */
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SendHorizontal, Sparkles } from "lucide-react";
import { Button, IconButton, Spinner, cn, toast } from "@tau/ui";
import { aiErrorMessage, needsSetup } from "../ai";
import { addDays, formatYuan, type Config } from "../data/model";
import { parseLine } from "../data/parse";
import type { MonthStat } from "../data/stats";
import { EXPENSE_KEY, useRuntime } from "../runtime";
import { CategoryIcon, categoryColor, yuan } from "./bits";
import { useAliases } from "./queries";

export function QuickAdd({
  today,
  time,
  config,
  stat,
  examples = [],
}: {
  today: string;
  time: string;
  config: Config;
  /** 今天所在月的统计，用来预览余额 */
  stat: MonthStat;
  examples?: readonly string[];
}) {
  const { data, ai, context } = useRuntime();
  const client = useQueryClient();
  const aliases = useAliases();
  const [text, setText] = useState("");
  // 手动选的分类只对选它时的那句备注有效，备注改了就回到自动识别
  const [pick, setPick] = useState<{ note: string; category: string } | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState<{ message: string; setup: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  const draft = useMemo(() => parseLine(text, config.categories, aliases.data ?? {}), [text, config.categories, aliases.data]);
  const picked = pick && draft && pick.note === draft.note ? pick.category : null;
  const category = picked ?? draft?.category ?? null;
  const cat = config.categories.find(c => c.id === category) ?? null;
  const valid = draft != null && draft.cents != null && cat != null;
  const date = addDays(today, draft?.dayOffset ?? 0);

  const change = (value: string) => {
    requestRef.current?.abort();
    setClassifying(false);
    setError(null);
    setText(value);
    if (!value.trim()) setPick(null);
  };

  const classify = async () => {
    if (!draft?.note || classifying) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setClassifying(true);
    setError(null);
    try {
      const id = await ai.classify(draft.note, config.categories, controller.signal);
      if (!controller.signal.aborted && !context.signal.aborted) setPick({ note: draft.note, category: id });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = aiErrorMessage(err);
      if (message) setError({ message, setup: needsSetup(err) });
    } finally {
      if (!controller.signal.aborted) setClassifying(false);
    }
  };

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await data.addTx({ date, time: draft.dayOffset ? "12:00" : time, cents: draft.cents!, category: cat.id, note: draft.note, recurringId: null });
      // 手动选过（含 AI 归类）才记住，关键词识别的不占记忆；记不住不影响这笔已经记下
      if (draft.note && picked != null) await data.rememberAlias(draft.note, cat.id).catch(() => undefined);
      if (context.signal.aborted) return;
      toast.success(`已记下 ${draft.note || cat.name} ${yuan(draft.cents!)}`);
      setText("");
      setPick(null);
      await client.invalidateQueries({ queryKey: EXPENSE_KEY });
      inputRef.current?.focus();
    } catch {
      toast.error("记录失败");
    } finally {
      setSaving(false);
    }
  };

  const catStat = cat ? stat.categories.find(c => c.id === cat.id) : null;
  const sameMonth = date.slice(0, 7) === stat.month;
  const catAfter = catStat && draft?.cents != null ? catStat.spent + draft.cents : null;
  const left = draft?.cents != null ? stat.budget - stat.total - draft.cents : null;

  return (
    <div className="ex:flex ex:flex-col ex:gap-2.5">
      <div className="ex:bg-hover ex:focus-within:bg-surface ex:flex ex:h-10 ex:items-center ex:gap-2 ex:rounded-[12px] ex:pr-1.5 ex:pl-3 ex:transition-[box-shadow,background] ex:duration-150 ex:ease-tau-out ex:focus-within:shadow-[inset_0_0_0_1.5px_var(--tau-accent)]">
        <input
          ref={inputRef}
          value={text}
          onChange={e => change(e.target.value)}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape" && text) {
              e.preventDefault();
              e.stopPropagation();
              change("");
            }
          }}
          placeholder="写一句：午饭 牛肉面 28"
          aria-label="一句话记一笔支出"
          className="ex:text-tau-body ex:placeholder:text-ink-3 ex:min-w-0 ex:flex-1 ex:bg-transparent ex:outline-none"
        />
        <IconButton aria-label="记下" disabled={!valid || saving} onClick={() => void submit()}>
          {saving ? <Spinner /> : <SendHorizontal className="ex:size-[15px]" strokeWidth={1.75} />}
        </IconButton>
      </div>

      {draft && (
        <div className="ex:bg-hover ex:flex ex:flex-col ex:gap-2 ex:rounded-[12px] ex:px-3 ex:py-2.5 ex:text-[12.5px]">
          <div className="ex:flex ex:items-center ex:gap-2">
            {cat ? <CategoryIcon category={cat} size="sm" /> : <span className="ex:size-[18px] ex:rounded-full ex:shadow-[inset_0_0_0_1px_var(--tau-line-1)]" />}
            <span className="ex:min-w-0 ex:flex-1 ex:truncate">
              {draft.dayOffset !== 0 && <span className="ex:text-ink-3">{draft.dayOffset === -1 ? "昨天 · " : "前天 · "}</span>}
              {draft.note || <span className="ex:text-ink-3">无备注</span>}
            </span>
            {draft.cents == null ? (
              <span className="ex:text-warn ex:text-[12px]">缺金额</span>
            ) : (
              <b className="ex:font-semibold ex:tabular-nums">−{formatYuan(draft.cents)}</b>
            )}
          </div>
          <div className="ex:flex ex:flex-wrap ex:gap-1" role="radiogroup" aria-label="分类">
            {config.categories.map(c => {
              const on = c.id === category;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => draft && setPick({ note: draft.note, category: c.id })}
                  className={cn(
                    "ex:inline-flex ex:h-[22px] ex:items-center ex:gap-1 ex:rounded-full ex:pr-2 ex:pl-0.5 ex:text-[11.5px]",
                    on ? "ex:bg-surface ex:text-ink-1 ex:font-medium" : "ex:text-ink-2 ex:hover:bg-press"
                  )}
                  style={on ? { boxShadow: `inset 0 0 0 1.5px ${categoryColor(c.color)}` } : undefined}
                >
                  <CategoryIcon category={c} size="sm" />
                  {c.name}
                </button>
              );
            })}
          </div>
          {error ? (
            <div className="ex:text-ink-2 ex:flex ex:items-center ex:gap-2 ex:text-[12px]">
              {error.message}，点一下分类就行
              {error.setup && (
                <Button size="sm" variant="ghost" onClick={() => context.ai.openSettings()}>
                  去设置
                </Button>
              )}
            </div>
          ) : !cat ? (
            <div className="ex:text-ink-3 ex:flex ex:items-center ex:gap-2 ex:text-[12px]">
              没认出分类，点一下；记过一次后同样的写法会自动归类
              {draft.note && (
                <Button size="sm" variant="ghost" icon={classifying ? undefined : Sparkles} loading={classifying} onClick={() => void classify()}>
                  AI 归类
                </Button>
              )}
            </div>
          ) : (
            catAfter != null &&
            sameMonth && (
              <div className="ex:text-ink-2 ex:text-[12px]">
                记下后：{cat.name}本月{" "}
                <b className={cn("ex:font-semibold ex:tabular-nums", cat.budget > 0 && catAfter > cat.budget ? "ex:text-danger" : "ex:text-ink-1")}>
                  {yuan(catAfter)}
                </b>
                {cat.budget > 0 && <span className="ex:tabular-nums"> / {formatYuan(cat.budget)}</span>}
                {cat.budget > 0 && catAfter > cat.budget && <span className="ex:text-danger">，已超</span>}
                {stat.budget > 0 && left != null && (
                  <>
                    {" "}
                    · 本月{left < 0 ? "超出" : "还剩"}{" "}
                    <b className={cn("ex:font-semibold ex:tabular-nums", left < 0 ? "ex:text-danger" : "ex:text-ink-1")}>{yuan(Math.abs(left))}</b>
                  </>
                )}
              </div>
            )
          )}
        </div>
      )}

      {!text && examples.length > 0 && (
        <div className="ex:flex ex:flex-wrap ex:gap-1.5">
          {examples.map(example => (
            <button
              key={example}
              type="button"
              onClick={() => {
                change(example);
                inputRef.current?.focus();
              }}
              className="ex:text-ink-2 ex:hover:text-accent-text ex:h-6 ex:rounded-full ex:px-2.5 ex:text-[11.5px] ex:shadow-[inset_0_0_0_1px_var(--tau-line-1)] ex:hover:shadow-[inset_0_0_0_1px_var(--tau-accent)]"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
