/**
 * AI 卡：「提醒」看剩下几天每天能花多少、哪类要收着点，「月度复盘」看比平时多花在哪、能省多少。
 * 点「分析」才请求（不在打开页面时自动消耗额度）；结果按范围缓存到本次打开结束，数据变了提示重新分析。
 */
import { useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button, IconButton, Segmented, cn } from "@tau/ui";
import { aiErrorMessage, needsSetup, type AIScope, type AnalysisInput } from "../ai";
import { useRuntime } from "../runtime";
import { Card } from "./bits";

interface Result {
  text: string;
  /** 生成时的数据指纹，变了说明结果可能过时 */
  stamp: string;
  done: boolean;
}

export function AIPanel({ input, stamp, className }: { input: AnalysisInput; stamp: string; className?: string }) {
  const { ai, context } = useRuntime();
  const [scope, setScope] = useState<AIScope>("tip");
  const [results, setResults] = useState<Partial<Record<AIScope, Result>>>({});
  const [error, setError] = useState<{ message: string; setup: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => () => controller.current?.abort(), []);

  const run = async (target: AIScope) => {
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
      const message = aiErrorMessage(err);
      setResults(r => {
        const next = { ...r };
        delete next[target];
        return next;
      });
      if (message) setError({ message, setup: needsSetup(err) });
    }
  };

  const result = results[scope];
  const streaming = result != null && !result.done;
  const stale = result?.done && result.stamp !== stamp;
  return (
    <Card className={cn("ex:relative ex:flex ex:flex-col ex:gap-2.5 ex:overflow-hidden ex:px-4 ex:py-3.5", className)}>
      <div
        aria-hidden
        className="ex:pointer-events-none ex:absolute ex:inset-0"
        style={{ background: "radial-gradient(120% 140% at 100% 0%, var(--tau-accent-soft), transparent 55%)" }}
      />
      <div className="ex:relative ex:flex ex:items-center ex:gap-2">
        <span className="ex:bg-accent-soft ex:text-accent-text ex:grid ex:size-[22px] ex:place-items-center ex:rounded-[7px]">
          <Sparkles className="ex:size-[13px]" strokeWidth={1.75} />
        </span>
        <b className="ex:text-[13px] ex:font-semibold">AI</b>
        <span className="ex:flex-1" />
        <Segmented<AIScope> label="分析范围" size="sm" value={scope} onValueChange={setScope}>
          <Segmented.Item value="tip" label="提醒" />
          <Segmented.Item value="review" label="月度复盘" />
        </Segmented>
        {result?.done && (
          <IconButton aria-label="重新分析" onClick={() => void run(scope)} className="ex:size-[26px]">
            <RefreshCw className="ex:size-[14px]" strokeWidth={1.75} />
          </IconButton>
        )}
      </div>
      <div className="ex:relative ex:min-h-[72px] ex:text-[12.5px] ex:leading-[1.8]">
        {result ? (
          <Rendered text={result.text} streaming={streaming} />
        ) : error ? (
          <div className="ex:text-ink-2 ex:flex ex:flex-col ex:items-start ex:gap-2">
            {error.message}
            {error.setup ? (
              <Button size="sm" variant="secondary" onClick={() => context.ai.openSettings()}>
                去分配模型
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => void run(scope)}>
                重试
              </Button>
            )}
          </div>
        ) : (
          <div className="ex:text-ink-2 ex:flex ex:flex-col ex:items-start ex:gap-2">
            {scope === "tip"
              ? "看看剩下几天每天最多花多少，哪个分类需要收着点。"
              : "复盘这个月比平时多花或少花在哪，给出能省多少的建议。"}
            <Button size="sm" variant="soft" icon={Sparkles} onClick={() => void run(scope)}>
              分析
            </Button>
          </div>
        )}
        {stale && (
          <button
            type="button"
            onClick={() => void run(scope)}
            className="ex:text-accent-text ex:mt-1.5 ex:text-[11.5px] ex:hover:underline"
          >
            记录有变化，重新分析
          </button>
        )}
      </div>
      <p className="ex:text-ink-3 ex:relative ex:mt-auto ex:text-[11px]">
        AI 只读取分类金额和备注文字，使用「对话功能」的模型
      </p>
    </Card>
  );
}

const BULLET = /^\s*[-•]\s/;

/** 只渲染 **粗体**、分段和「- 」开头的建议行，其余原样显示 */
function Rendered({ text, streaming }: { text: string; streaming: boolean }) {
  const paragraphs = text.split(/\n{1,}/).filter(p => p.trim());
  return (
    <div className="ex:flex ex:flex-col ex:gap-2">
      {paragraphs.map((p, i) => (
        <p key={i} className={BULLET.test(p) ? "ex:relative ex:pl-3.5" : undefined}>
          {BULLET.test(p) && <span aria-hidden className="ex:text-ink-3 ex:absolute ex:left-0.5">·</span>}
          {p.replace(BULLET, "").split(/(\*\*[^*]+\*\*)/).map((part, k) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <b key={k} className="ex:font-semibold">
                {part.slice(2, -2)}
              </b>
            ) : (
              part
            )
          )}
          {streaming && i === paragraphs.length - 1 && <Caret />}
        </p>
      ))}
      {streaming && paragraphs.length === 0 && (
        <p>
          <Caret />
        </p>
      )}
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      className="ex:bg-accent ex:ml-0.5 ex:inline-block ex:h-3.5 ex:w-[7px] ex:animate-pulse ex:rounded-[2px] ex:align-[-2px]"
    />
  );
}
