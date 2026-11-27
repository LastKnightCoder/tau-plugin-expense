/**
 * 手机「回顾与 AI」（二级页）：近 6 个月支出构成（点柱子看那个月）、一周里哪天花得多、AI 提醒 / 月度复盘。
 * 图表沿用桌面组件（按宽度绘制）；AI 点了才分析，记录变了提示重新分析，范围用文字页签。
 */
import { useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { useI18n } from "@tau/plugins";
import { aiErrorKey, needsSetup, type AIScope, type AnalysisInput } from "../../ai";
import type { Category } from "../../data/model";
import type { MonthTotal } from "../../data/stats";
import { useRuntime } from "../../runtime";
import { messages, type MessageKey } from "../../i18n";
import { Rendered } from "../AIPanel";
import { categoryColor, monthLabel, yuan } from "../bits";
import { MonthsChart, WeekdayBars } from "../Review";
import { CardTitle, MCard, PrimaryButton, TextTabs } from "./parts";

export function ReviewView({
  months,
  categories,
  budget,
  current,
  weekday,
  aiInput,
  stamp,
}: {
  months: readonly MonthTotal[];
  categories: readonly Category[];
  budget: number;
  current: string;
  weekday: { mean: (number | null)[]; days: number[] };
  aiInput: AnalysisInput;
  stamp: string;
}) {
  const { t, locale } = useI18n(messages);
  const [selected, setSelected] = useState(current);
  const picked = months.find(m => m.month === selected) ?? null;
  return (
    <div className="ex:flex ex:flex-col ex:gap-3 ex:pt-1 ex:pb-6">
      <MCard className="ex:px-3">
        <div className="ex:px-1">
          <CardTitle title={t("review.title")} note={budget > 0 ? t("review.budgetLine", { amount: yuan(budget) }) : t("review.switchNote")} />
        </div>
        <MonthsChart months={months} categories={categories} budget={budget} selected={selected} current={current} onPick={setSelected} />
        {picked && (
          <div className="ex:border-line-2 ex:mx-1 ex:mt-1 ex:border-t ex:pt-2">
            <div className="ex:text-ink-3 ex:flex ex:text-[11.5px]">
              {t("date.yearMonth", { year: picked.month.slice(0, 4), month: monthLabel(picked.month, locale) })}
              {picked.month === current ? t("review.inProgressSuffix") : ""}
              <span className="ex:flex-1" />
              {t("review.total")} <b className="ex:text-ink-1 ex:ml-1 ex:tabular-nums">{yuan(picked.total)}</b>
            </div>
            <div className="ex:mt-1.5 ex:grid ex:grid-cols-2 ex:gap-x-4 ex:gap-y-1 ex:text-[12px]">
              {categories
                .filter(c => (picked.byCategory[c.id] ?? 0) > 0)
                .sort((a, b) => picked.byCategory[b.id] - picked.byCategory[a.id])
                .map(c => (
                  <span key={c.id} className="ex:flex ex:items-center ex:gap-1.5">
                    <i className="ex:size-2 ex:shrink-0 ex:rounded-[2px]" style={{ background: categoryColor(c.color) }} />
                    <span className="ex:truncate">{c.name}</span>
                    <b className="ex:ml-auto ex:font-semibold ex:tabular-nums">{yuan(picked.byCategory[c.id])}</b>
                  </span>
                ))}
            </div>
          </div>
        )}
      </MCard>
      <MCard className="ex:px-0 ex:pb-0">
        <div className="ex:px-4">
          <CardTitle title={t("review.weekdayTitle")} note={t("review.weekdayNote")} />
        </div>
        <WeekdayBars weekday={weekday} />
      </MCard>
      <AICard input={aiInput} stamp={stamp} />
    </div>
  );
}

function AICard({ input, stamp }: { input: AnalysisInput; stamp: string }) {
  const { ai, context } = useRuntime();
  const { t } = useI18n(messages);
  const [scope, setScope] = useState<AIScope>("tip");
  const [results, setResults] = useState<Partial<Record<AIScope, { text: string; stamp: string; done: boolean }>>>({});
  const [error, setError] = useState<{ scope: AIScope; key: MessageKey; setup: boolean } | null>(null);
  const [running, setRunning] = useState<AIScope | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => () => controller.current?.abort(), []);

  const run = async () => {
    if (controller.current && !controller.current.signal.aborted) return;
    const target = scope;
    setContentHeight(content.current?.getBoundingClientRect().height ?? 0);
    const current = new AbortController();
    controller.current = current;
    setRunning(target);
    setError(null);
    setResults(r => ({ ...r, [target]: { text: "", stamp, done: false } }));
    try {
      let text = "";
      for await (const delta of ai.analyze(target, latest.current, current.signal)) {
        if (current.signal.aborted || context.signal.aborted) return;
        text += delta;
        setResults(r => ({ ...r, [target]: { text, stamp, done: false } }));
      }
      if (current.signal.aborted || context.signal.aborted) return;
      setResults(r => ({ ...r, [target]: { text, stamp, done: true } }));
    } catch (err) {
      if (current.signal.aborted) return;
      setResults(r => {
        const next = { ...r };
        delete next[target];
        return next;
      });
      const key = aiErrorKey(err);
      if (key) setError({ scope: target, key, setup: needsSetup(err) });
    } finally {
      if (controller.current === current) {
        controller.current = null;
        setRunning(null);
      }
    }
  };

  const result = results[scope];
  const streaming = running === scope;
  const visibleError = error?.scope === scope ? error : null;
  const stale = result?.done && result.stamp !== stamp;
  return (
    <MCard>
      <TextTabs<AIScope>
        value={scope}
        onChange={next => {
          if (next === scope) return;
          setScope(next);
          setContentHeight(0);
        }}
        options={[
          ["tip", t("ai.tip")],
          ["review", t("ai.review")],
        ]}
      />
      <div ref={content} style={{ minHeight: contentHeight }} aria-busy={streaming}>
        {result && (result.text || result.done) ? (
          <div className="ex:text-[13.5px] ex:leading-[1.75]">
            <Rendered text={result.text} streaming={streaming} />
            {stale && (
              <div className="ex:text-ink-3 ex:mt-2.5 ex:flex ex:items-center ex:gap-1.5 ex:text-[12px]">
                {t("ai.staleMobile")}
                <span className="ex:flex-1" />
                <PrimaryButton small ghost disabled={running !== null} onClick={() => void run()}>
                  <RefreshCw />
                  {t("ai.rerun")}
                </PrimaryButton>
              </div>
            )}
          </div>
        ) : (
          <p className="ex:text-ink-2 ex:pt-2 ex:text-center ex:text-[13px] ex:leading-[1.7]">
            {streaming
              ? t("ai.analyzing")
              : visibleError
                ? t(visibleError.key)
                : scope === "tip"
                  ? t("ai.tipHint")
                  : t("ai.reviewHint")}
          </p>
        )}
        {!result?.done && (
          <div className="ex:pb-2 ex:text-center">
            <PrimaryButton
              small
              className="ex:mx-auto ex:mt-3"
              disabled={running !== null}
              onClick={() => (visibleError?.setup ? void context.ai.openSettings() : void run())}
            >
              {visibleError?.setup ? (
                t("common.configureModel")
              ) : (
                <>
                  <Sparkles />
                  {streaming ? t("ai.running") : visibleError ? t("ai.retry") : scope === "tip" ? t("ai.startTip") : t("ai.startReview")}
                </>
              )}
            </PrimaryButton>
            <p className="ex:text-ink-3 ex:mt-2.5 ex:text-[11px]">{t("ai.footMobile")}</p>
          </div>
        )}
      </div>
    </MCard>
  );
}
