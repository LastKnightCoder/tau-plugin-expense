/**
 * 手机「回顾与 AI」（二级页）：近 6 个月支出构成（点柱子看那个月）、一周里哪天花得多、AI 提醒 / 月度复盘。
 * 图表沿用桌面组件（按宽度绘制）；AI 点了才分析，记录变了提示重新分析，范围用文字页签。
 */
import { useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { aiErrorMessage, needsSetup, type AIScope, type AnalysisInput } from "../../ai";
import type { Category } from "../../data/model";
import type { MonthTotal } from "../../data/stats";
import { useRuntime } from "../../runtime";
import { Rendered } from "../AIPanel";
import { categoryColor, yuan } from "../bits";
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
  const [selected, setSelected] = useState(current);
  const picked = months.find(m => m.month === selected) ?? null;
  return (
    <div className="ex:flex ex:flex-col ex:gap-3 ex:pt-1 ex:pb-6">
      <MCard className="ex:px-3">
        <div className="ex:px-1">
          <CardTitle title="近 6 个月" note={budget > 0 ? `虚线 = 月预算 ${yuan(budget)}` : "点柱子看那个月"} />
        </div>
        <MonthsChart months={months} categories={categories} budget={budget} selected={selected} current={current} onPick={setSelected} />
        {picked && (
          <div className="ex:border-line-2 ex:mx-1 ex:mt-1 ex:border-t ex:pt-2">
            <div className="ex:text-ink-3 ex:flex ex:text-[11.5px]">
              {picked.month.slice(0, 4)} 年 {Number(picked.month.slice(5))} 月{picked.month === current ? " · 进行中" : ""}
              <span className="ex:flex-1" />
              合计 <b className="ex:text-ink-1 ex:ml-1 ex:tabular-nums">{yuan(picked.total)}</b>
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
          <CardTitle title="一周里哪天花得多" note="近 90 天日均可控支出" />
        </div>
        <WeekdayBars weekday={weekday} />
      </MCard>
      <AICard input={aiInput} stamp={stamp} />
    </div>
  );
}

function AICard({ input, stamp }: { input: AnalysisInput; stamp: string }) {
  const { ai, context } = useRuntime();
  const [scope, setScope] = useState<AIScope>("tip");
  const [results, setResults] = useState<Partial<Record<AIScope, { text: string; stamp: string; done: boolean }>>>({});
  const [error, setError] = useState<{ message: string; setup: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => () => controller.current?.abort(), []);

  const run = async () => {
    const target = scope;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setError(null);
    setResults(r => ({ ...r, [target]: { text: "", stamp, done: false } }));
    try {
      let text = "";
      for await (const delta of ai.analyze(target, latest.current, current.signal)) {
        if (current.signal.aborted || context.signal.aborted) return;
        text += delta;
        setResults(r => ({ ...r, [target]: { text, stamp, done: false } }));
      }
      setResults(r => ({ ...r, [target]: { text, stamp, done: true } }));
    } catch (err) {
      if (current.signal.aborted) return;
      setResults(r => {
        const next = { ...r };
        delete next[target];
        return next;
      });
      const message = aiErrorMessage(err);
      if (message) setError({ message, setup: needsSetup(err) });
    }
  };

  const result = results[scope];
  const stale = result?.done && result.stamp !== stamp;
  return (
    <MCard>
      <TextTabs<AIScope>
        value={scope}
        onChange={next => {
          setScope(next);
          setError(null);
        }}
        options={[
          ["tip", "提醒"],
          ["review", "月度复盘"],
        ]}
      />
      {result ? (
        <div className="ex:text-[13.5px] ex:leading-[1.75]">
          <Rendered text={result.text} streaming={!result.done} />
          {stale && (
            <div className="ex:text-ink-3 ex:mt-2.5 ex:flex ex:items-center ex:gap-1.5 ex:text-[12px]">
              记录有变化，结果可能过时
              <span className="ex:flex-1" />
              <PrimaryButton small ghost onClick={() => void run()}>
                <RefreshCw />
                重新分析
              </PrimaryButton>
            </div>
          )}
        </div>
      ) : (
        <div className="ex:py-2 ex:text-center">
          <p className="ex:text-ink-2 ex:text-[13px] ex:leading-[1.7]">
            {error
              ? error.message
              : scope === "tip"
                ? "看看剩下几天每天最多花多少，哪类要收着点"
                : "看这个月比平时多花在哪，给出能省多少的建议"}
          </p>
          <PrimaryButton
            small
            className="ex:mx-auto ex:mt-3"
            onClick={() => (error?.setup ? void context.ai.openSettings() : void run())}
          >
            {error?.setup ? (
              "去配置模型"
            ) : (
              <>
                <Sparkles />
                {error ? "重试" : scope === "tip" ? "开始分析" : "开始复盘"}
              </>
            )}
          </PrimaryButton>
          <p className="ex:text-ink-3 ex:mt-2.5 ex:text-[11px]">AI 只读取分类金额和备注文字，点了才分析</p>
        </div>
      )}
    </MCard>
  );
}
