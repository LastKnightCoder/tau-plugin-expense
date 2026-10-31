/**
 * 页底记账条：一句话 + 麦克风 + 发送，解析与桌面一句话记账相同（parseLine）。
 * 聚焦时浮出识别预览：分类、金额、记下后这一类与本月还剩多少；认不出分类时给分类胶囊与「AI 归类」，
 * 不选直接发送记到「其他」。没聚焦时显示常记胶囊（按备注记忆，最近的在前），点一下填进输入条。
 * 按住麦克风说一段话交给 VoiceSheet 整理。
 */
import { useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Calendar, History, Mic, Sparkles, TriangleAlert } from "lucide-react";
import { cn, toast } from "@tau/ui";
import { aiErrorMessage, needsSetup } from "../../ai";
import { OTHER, addDays, monthOf, type Config, type Tx } from "../../data/model";
import { parseLine } from "../../data/parse";
import type { MonthStat } from "../../data/stats";
import { useRuntime } from "../../runtime";
import { dayLabel, yuan } from "../bits";
import { useAliases } from "../queries";
import { addTxs, removeWithUndo } from "./actions";
import { Bar, CatIcon } from "./parts";
import { useHoldToTalk, type HoldToTalk } from "./useHoldToTalk";

export interface LogBarHandle {
  /** 预填文字并聚焦（首页卡片「记一笔」、月历「补记这天」） */
  fill(text: string): void;
}

const EXAMPLES = ["奶茶 18", "打车回家 36", "昨天 份子钱 600"];

export function LogBar({
  ref,
  today,
  time,
  config,
  stat,
  recent,
  onVoice,
  onSaved,
}: {
  ref?: Ref<LogBarHandle>;
  today: string;
  time: string;
  config: Config;
  /** 今天所在月的统计 */
  stat: MonthStat;
  /** 最近的流水，常记胶囊取其中的备注 */
  recent: readonly Tx[];
  onVoice(text: string): void;
  onSaved?(tx: Tx): void;
}) {
  const runtime = useRuntime();
  const { ai, context } = runtime;
  const client = useQueryClient();
  const aliases = useAliases();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [pick, setPick] = useState<{ note: string; category: string } | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [aiError, setAiError] = useState<{ message: string; setup: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  useImperativeHandle(ref, () => ({
    fill(value) {
      change(value);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  }));

  const draft = useMemo(() => parseLine(text, config.categories, aliases.data ?? {}), [text, config.categories, aliases.data]);
  const picked = pick && draft && pick.note === draft.note ? pick.category : null;
  const category = picked ?? draft?.category ?? null;
  const cat = config.categories.find(c => c.id === category) ?? null;
  const date = addDays(today, draft?.dayOffset ?? 0);

  const change = (value: string) => {
    requestRef.current?.abort();
    setClassifying(false);
    setAiError(null);
    setText(value.slice(0, 80));
    if (!value.trim()) setPick(null);
  };

  const classify = async () => {
    if (!draft?.note || classifying) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setClassifying(true);
    setAiError(null);
    try {
      const id = await ai.classify(draft.note, config.categories, controller.signal);
      if (!controller.signal.aborted && !context.signal.aborted) setPick({ note: draft.note, category: id });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = aiErrorMessage(err);
      if (message) setAiError({ message, setup: needsSetup(err) });
    } finally {
      if (!controller.signal.aborted) setClassifying(false);
    }
  };

  const submit = async () => {
    if (!draft || draft.cents == null || saving) {
      if (draft && draft.cents == null) toast.info("写上金额，比如「奶茶 18」");
      return;
    }
    const target = category ?? OTHER;
    setSaving(true);
    try {
      const [tx] = await addTxs(runtime, client, [
        {
          date,
          time: draft.dayOffset ? "12:00" : time,
          cents: draft.cents,
          category: target,
          note: draft.note,
          // 关键词识别的不占记忆；没选分类记到「其他」也不记
          remember: picked != null,
        },
      ]);
      if (context.signal.aborted) return;
      const name = config.categories.find(c => c.id === target)?.name ?? "其他";
      const after = catLeft(target, draft.cents);
      toast.success(`记下 ${draft.note || name} ${yuan(draft.cents)}${after != null ? ` · ${name}${after < 0 ? `超了 ${yuan(-after)}` : `还剩 ${yuan(after)}`}` : ""}`, {
        action: { label: "撤销", onClick: () => void removeWithUndo(runtime, client, tx) },
      });
      change("");
      onSaved?.(tx);
    } catch {
      toast.error("记录失败");
    } finally {
      setSaving(false);
    }
  };

  // 记下后这一类本月还剩多少（只在记到本月时算）
  const catLeft = (id: string, cents: number) => {
    const c = config.categories.find(x => x.id === id);
    if (!c || c.budget <= 0 || monthOf(date) !== stat.month) return null;
    const spent = stat.categories.find(x => x.id === id)?.spent ?? 0;
    return c.budget - spent - cents;
  };

  const talk = useHoldToTalk({ onText: onVoice, onError: message => toast.info(message) });

  const chips = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of [...recent].reverse()) {
      if (t.recurringId || !t.note || seen.has(t.note)) continue;
      seen.add(t.note);
      out.push(t.note);
      if (out.length >= 8) break;
    }
    return out;
  }, [recent]);
  const chipList = chips.length ? chips : EXAMPLES;
  const showPreview = draft != null && focused;

  return (
    <div className="ex:bg-page ex:shrink-0 ex:px-3 ex:pt-2 ex:pb-[max(8px,env(safe-area-inset-bottom))]">
      {talk.active ? (
        <TalkPanel talk={talk} />
      ) : showPreview ? (
        <Preview
          draft={draft}
          cat={cat}
          config={config}
          date={date}
          today={today}
          stat={stat}
          source={picked != null ? "picked" : draft.source}
          classifying={classifying}
          aiError={aiError}
          onPick={id => setPick({ note: draft.note, category: id })}
          onClassify={() => void classify()}
          onOpenAI={() => void context.ai.openSettings()}
        />
      ) : !text ? (
        <div className="ex:scrollbar-none ex:-mx-3 ex:mb-2 ex:flex ex:gap-1.5 ex:overflow-x-auto ex:px-3" data-no-tab-swipe>
          {chipList.map(note => (
            <button
              key={note}
              type="button"
              onClick={() => {
                change(chips.length ? `${note} ` : note);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className="ex:bg-surface ex:text-ink-2 ex:flex ex:h-[30px] ex:shrink-0 ex:items-center ex:rounded-full ex:px-3 ex:text-[12.5px] ex:shadow-[inset_0_0_0_1px_var(--tau-line-1)] ex:active:bg-press"
            >
              {note}
            </button>
          ))}
        </div>
      ) : null}

      <div className="ex:bg-surface ex:shadow-float ex:flex ex:min-h-[52px] ex:items-center ex:gap-1.5 ex:rounded-[24px] ex:py-1.5 ex:pr-1.5 ex:pl-4">
        <input
          ref={inputRef}
          value={text}
          enterKeyHint="send"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={e => change(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="午饭 牛肉面 28"
          aria-label="一句话记一笔支出"
          className="ex:placeholder:text-ink-3 ex:min-w-0 ex:flex-1 ex:bg-transparent ex:text-[15px] ex:outline-none"
        />
        {text.trim() ? (
          <button
            type="button"
            aria-label="记下"
            disabled={saving || draft?.cents == null}
            // 按下时不让输入框失焦，连续记账时键盘不收起
            onPointerDown={e => e.preventDefault()}
            onClick={() => void submit()}
            className="ex:bg-accent ex:text-ink-inverse ex:grid ex:size-10 ex:shrink-0 ex:place-items-center ex:rounded-full ex:disabled:opacity-35"
          >
            <ArrowUp className="ex:size-[19px]" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="按住说话"
            {...talk.bind}
            className={cn(
              "ex:grid ex:size-10 ex:shrink-0 ex:touch-none ex:place-items-center ex:rounded-full ex:select-none",
              talk.unavailable ? "ex:text-ink-3" : "ex:bg-accent-soft ex:text-accent-text"
            )}
          >
            <Mic className="ex:size-5" />
          </button>
        )}
      </div>
    </div>
  );
}

function Preview({
  draft,
  cat,
  config,
  date,
  today,
  stat,
  source,
  classifying,
  aiError,
  onPick,
  onClassify,
  onOpenAI,
}: {
  draft: NonNullable<ReturnType<typeof parseLine>>;
  cat: Config["categories"][number] | null;
  config: Config;
  date: string;
  today: string;
  stat: MonthStat;
  source: "picked" | "alias" | "keyword" | null;
  classifying: boolean;
  aiError: { message: string; setup: boolean } | null;
  onPick(id: string): void;
  onClassify(): void;
  onOpenAI(): void;
}) {
  const [choosing, setChoosing] = useState(false);
  const sameMonth = monthOf(date) === stat.month;
  const catStat = cat ? stat.categories.find(c => c.id === cat.id) : null;
  const cents = draft.cents;
  const catAfter = cat && catStat && cents != null && cat.budget > 0 && sameMonth ? cat.budget - catStat.spent - cents : null;
  const monthAfter = cents != null && stat.budget > 0 && sameMonth ? stat.budget - stat.total - cents : null;
  const showChips = !cat || choosing;
  // 胶囊按本月用得多的排
  const ordered = [...config.categories].sort(
    (a, b) => (stat.categories.find(c => c.id === b.id)?.spent ?? 0) - (stat.categories.find(c => c.id === a.id)?.spent ?? 0)
  );
  const note =
    draft.dayOffset !== 0 ? (
      <>
        <Calendar className="ex:size-[11px]" />
        {draft.dayOffset === -1 ? "昨天" : "前天"} · {dayLabel(date)}
        {cat ? ` · ${cat.name}` : ""}
      </>
    ) : !cat ? (
      draft.note ? `选一个分类，下次写「${draft.note}」自动归到这里` : "选一个分类"
    ) : (
      <>
        <History className="ex:size-[11px]" />
        {cat.name} · {source === "alias" ? "按上次的归类" : source === "picked" ? "你选的" : "按关键词"}
      </>
    );

  return (
    <div className="ex:bg-surface ex:shadow-float ex:mb-2 ex:rounded-[20px] ex:px-3.5 ex:py-3">
      <div className="ex:flex ex:items-center ex:gap-2.5">
        <button type="button" aria-label="换分类" onClick={() => setChoosing(v => !v)} onPointerDown={e => e.preventDefault()}>
          <CatIcon category={cat} size={34} />
        </button>
        <span className="ex:min-w-0 ex:flex-1">
          <b className="ex:block ex:truncate ex:text-[15px] ex:font-semibold">{draft.note || <span className="ex:text-ink-3">无备注</span>}</b>
          <small className="ex:text-ink-3 ex:flex ex:items-center ex:gap-1 ex:truncate ex:text-[11px]">{note}</small>
        </span>
        {cents != null ? (
          <b className="ex:shrink-0 ex:text-[20px] ex:font-[750] ex:tabular-nums">{yuan(cents)}</b>
        ) : (
          <span className="ex:text-warn ex:shrink-0 ex:text-[12.5px]">缺金额</span>
        )}
      </div>
      {showChips ? (
        <div className="ex:mt-2.5 ex:flex ex:flex-wrap ex:gap-1.5" role="radiogroup" aria-label="分类">
          {draft.note && !cat && (
            <button
              type="button"
              disabled={classifying}
              onPointerDown={e => e.preventDefault()}
              onClick={aiError?.setup ? onOpenAI : onClassify}
              className="ex:bg-accent-soft ex:text-accent-text ex:flex ex:h-8 ex:items-center ex:gap-1 ex:rounded-full ex:px-3 ex:text-[12.5px] ex:font-semibold ex:disabled:opacity-60"
            >
              <Sparkles className={cn("ex:size-[13px]", classifying && "ex:animate-pulse")} />
              {aiError?.setup ? "去配置模型" : classifying ? "归类中" : "AI 归类"}
            </button>
          )}
          {ordered.map(c => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={c.id === cat?.id}
              onPointerDown={e => e.preventDefault()}
              onClick={() => {
                onPick(c.id);
                setChoosing(false);
              }}
              className={cn(
                "ex:flex ex:h-8 ex:items-center ex:gap-1.5 ex:rounded-full ex:pr-3 ex:pl-[5px] ex:text-[12.5px]",
                c.id === cat?.id ? "ex:bg-ink-1 ex:text-ink-inverse" : "ex:text-ink-2 ex:shadow-[inset_0_0_0_1px_var(--tau-line-1)]"
              )}
            >
              <CatIcon category={c} size={22} />
              {c.name}
            </button>
          ))}
          {aiError && !aiError.setup && <span className="ex:text-ink-3 ex:basis-full ex:text-[11.5px]">{aiError.message}，点一下分类就行</span>}
        </div>
      ) : catAfter != null && catAfter < 0 ? (
        <div className="ex:border-line-2 ex:text-danger ex:mt-2.5 ex:flex ex:items-center ex:gap-1.5 ex:border-t ex:pt-2.5 ex:text-[12px]">
          <TriangleAlert className="ex:size-[13px] ex:shrink-0" />
          {catStat!.spent > cat!.budget
            ? `${cat!.name}已经超了 ${yuan(catStat!.spent - cat!.budget)}，记下后超 ${yuan(-catAfter)}`
            : `记下后${cat!.name}超 ${yuan(-catAfter)}`}
        </div>
      ) : catAfter != null && cat ? (
        <div className="ex:border-line-2 ex:text-ink-2 ex:mt-2.5 ex:flex ex:items-center ex:gap-2 ex:border-t ex:pt-2.5 ex:text-[12px]">
          <span className="ex:shrink-0">
            {cat.name}还剩 <b className="ex:text-ink-1 ex:font-[650] ex:tabular-nums">{yuan(catAfter)}</b>
          </span>
          <Bar
            className="ex:h-1.5 ex:flex-1"
            ratio={catStat!.spent / cat.budget}
            adding={cents! / cat.budget}
            pace={date === today ? stat.pace : null}
          />
          {monthAfter != null && (
            <span className="ex:shrink-0">
              本月 <b className={cn("ex:font-[650] ex:tabular-nums", monthAfter < 0 ? "ex:text-danger" : "ex:text-ink-1")}>{yuan(monthAfter)}</b>
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TalkPanel({ talk }: { talk: HoldToTalk }) {
  return (
    <div className="ex:bg-surface ex:shadow-float ex:mb-2 ex:rounded-[20px] ex:px-3.5 ex:pt-4 ex:pb-3.5 ex:text-center">
      <p className="ex:min-h-[44px] ex:text-left ex:text-[15px] ex:leading-[1.6] ex:font-semibold">
        {talk.preview || <span className="ex:text-ink-3 ex:font-normal">{talk.connecting ? "正在连接…" : "说说花了什么钱，比如「午饭二十八」"}</span>}
      </p>
      <div aria-hidden className="ex:my-2.5 ex:flex ex:h-[30px] ex:items-center ex:justify-center ex:gap-[3px]">
        {Array.from({ length: 30 }, (_, i) => (
          <i
            key={i}
            className={cn("ex:block ex:w-[3px] ex:rounded-full", talk.cancelArmed ? "ex:bg-danger" : "ex:bg-accent", talk.connecting && "ex:opacity-30")}
            style={{
              height: 5 + ((i * 17 + i * i * 3) % 24),
              animation: talk.connecting ? undefined : `ex-wave 1s ${(i % 7) * 0.08}s ease-in-out infinite alternate`,
            }}
          />
        ))}
      </div>
      <p className={cn("ex:text-[11.5px]", talk.cancelArmed ? "ex:text-danger" : "ex:text-ink-3")}>
        {talk.cancelArmed ? "松开 取消" : "松开 整理 · 上滑 取消"}
      </p>
    </div>
  );
}
