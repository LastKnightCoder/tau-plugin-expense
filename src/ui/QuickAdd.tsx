/**
 * 一句话记账：输入「午饭 牛肉面 28」，即时识别金额和分类，预览记下后这个分类和本月还剩多少，回车记下。
 * 认不出分类时让用户点一下，也可以点「AI 归类」；保存时记住这句备注对应的分类，下次自动带出。
 * 页面与首页卡片共用。
 */
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SendHorizontal, Sparkles } from "lucide-react";
import { Button, IconButton, Spinner, cn, toast } from "@tau/ui";
import { useI18n } from "@tau/plugins";
import { aiErrorKey, needsSetup } from "../ai";
import { addDays, dateKey, formatYuan, timeKey, type Config } from "../data/model";
import { parseLine } from "../data/parse";
import type { MonthStat } from "../data/stats";
import { EXPENSE_KEY, useRuntime } from "../runtime";
import { messages, type MessageKey } from "../i18n";
import { CategoryIcon, categoryColor, yuan } from "./bits";
import { useAliases } from "./queries";

export function QuickAdd({
  today,
  config,
  stat,
  examples = [],
}: {
  today: string;
  config: Config;
  /** 今天所在月的统计，用来预览余额 */
  stat: MonthStat;
  examples?: readonly string[];
}) {
  const { data, ai, context } = useRuntime();
  const { t } = useI18n(messages);
  const client = useQueryClient();
  const aliases = useAliases();
  const [text, setText] = useState("");
  // 手动选的分类只对选它时的那句备注有效，备注改了就回到自动识别
  const [pick, setPick] = useState<{ note: string; category: string } | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState<{ key: MessageKey; setup: boolean } | null>(null);
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
      const key = aiErrorKey(err);
      if (key) setError({ key, setup: needsSetup(err) });
    } finally {
      if (!controller.signal.aborted) setClassifying(false);
    }
  };

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const now = new Date();
      await data.addTx({ date: addDays(dateKey(now), draft.dayOffset), time: draft.dayOffset ? "12:00" : timeKey(now), cents: draft.cents!, category: cat.id, note: draft.note, recurringId: null });
      // 手动选过（含 AI 归类）才记住，关键词识别的不占记忆；记不住不影响这笔已经记下
      if (draft.note && picked != null) await data.rememberAlias(draft.note, cat.id).catch(() => undefined);
      if (context.signal.aborted) return;
      toast.success(t("quick.saved", { name: draft.note || cat.name, amount: yuan(draft.cents!) }));
      setText("");
      setPick(null);
      await client.invalidateQueries({ queryKey: EXPENSE_KEY });
      inputRef.current?.focus();
    } catch {
      toast.error(t("common.logFailed"));
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
          placeholder={t("quick.placeholder")}
          aria-label={t("quick.aria")}
          className="ex:text-tau-body ex:placeholder:text-ink-3 ex:min-w-0 ex:flex-1 ex:bg-transparent ex:outline-none"
        />
        <IconButton aria-label={t("quick.submitAria")} disabled={!valid || saving} onClick={() => void submit()}>
          {saving ? <Spinner /> : <SendHorizontal className="ex:size-[15px]" strokeWidth={1.75} />}
        </IconButton>
      </div>

      {draft && (
        <div className="ex:bg-hover ex:flex ex:flex-col ex:gap-2 ex:rounded-[12px] ex:px-3 ex:py-2.5 ex:text-[12.5px]">
          <div className="ex:flex ex:items-center ex:gap-2">
            {cat ? <CategoryIcon category={cat} size="sm" /> : <span className="ex:size-[18px] ex:rounded-full ex:shadow-[inset_0_0_0_1px_var(--tau-line-1)]" />}
            <span className="ex:min-w-0 ex:flex-1 ex:truncate">
              {draft.dayOffset !== 0 && (
                <span className="ex:text-ink-3">
                  {t("quick.dayPrefix", { day: draft.dayOffset === -1 ? t("date.yesterday") : t("date.dayBefore") })}
                </span>
              )}
              {draft.note || <span className="ex:text-ink-3">{t("quick.noNote")}</span>}
            </span>
            {draft.cents == null ? (
              <span className="ex:text-warn ex:text-[12px]">{t("quick.missingAmount")}</span>
            ) : (
              <b className="ex:font-semibold ex:tabular-nums">−{formatYuan(draft.cents)}</b>
            )}
          </div>
          <div className="ex:flex ex:flex-wrap ex:gap-1" role="radiogroup" aria-label={t("common.category")}>
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
              {t("quick.errorHint", { message: t(error.key) })}
              {error.setup && (
                <Button size="sm" variant="ghost" onClick={() => context.ai.openSettings()}>
                  {t("common.goSettings")}
                </Button>
              )}
            </div>
          ) : !cat ? (
            <div className="ex:text-ink-3 ex:flex ex:items-center ex:gap-2 ex:text-[12px]">
              {t("quick.unknownCat")}
              {draft.note && (
                <Button size="sm" variant="ghost" icon={classifying ? undefined : Sparkles} loading={classifying} onClick={() => void classify()}>
                  {t("quick.aiClassify")}
                </Button>
              )}
            </div>
          ) : (
            catAfter != null &&
            sameMonth && (
              <div className="ex:text-ink-2 ex:text-[12px]">
                {t("quick.afterPrefix")}
                {t("quick.catSpent", { name: cat.name, amount: yuan(catAfter) })}
                {cat.budget > 0 && <span className="ex:tabular-nums"> / {formatYuan(cat.budget)}</span>}
                {cat.budget > 0 && catAfter > cat.budget && <span className="ex:text-danger">{t("quick.overSuffix")}</span>}
                {stat.budget > 0 && left != null && (
                  <>
                    {" "}
                    {left < 0 ? t("quick.monthOver", { amount: yuan(Math.abs(left)) }) : t("quick.monthLeft", { amount: yuan(Math.abs(left)) })}
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
