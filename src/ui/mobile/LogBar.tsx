/**
 * 页底记账条：一句话 + 麦克风 + 发送，解析与桌面一句话记账相同（parseLine）。
 * 聚焦时浮出识别预览：分类、金额、记下后这一类与本月还剩多少；认不出分类时给分类胶囊与「AI 归类」，
 * 不选直接发送记到「其他」。没聚焦时显示常记胶囊（按备注记忆，最近的在前），点一下填进输入条。
 * 按住麦克风说一段话交给 VoiceSheet 整理。
 */
import { useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Calendar, History, Mic, Sparkles, TriangleAlert } from "lucide-react";
import { useI18n } from "@tau/plugins";
import { cn, toast } from "@tau/ui";
import { aiErrorKey, needsSetup } from "../../ai";
import { OTHER, addDays, dateKey, monthOf, timeKey, type Config, type Tx } from "../../data/model";
import { parseLine } from "../../data/parse";
import type { MonthStat } from "../../data/stats";
import { useRuntime } from "../../runtime";
import { messages, type MessageKey } from "../../i18n";
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
  config,
  stat,
  recent,
  onVoice,
  onSaved,
}: {
  ref?: Ref<LogBarHandle>;
  today: string;
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
  const { t } = useI18n(messages);
  const client = useQueryClient();
  const aliases = useAliases();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [pick, setPick] = useState<{ note: string; category: string } | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [aiError, setAiError] = useState<{ key: MessageKey; setup: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);

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

  const fill = (value: string) => {
    change(value);
    inputRef.current?.focus({ preventScroll: true });
  };
  useImperativeHandle(ref, () => ({ fill }));

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
      const key = aiErrorKey(err);
      if (key) setAiError({ key, setup: needsSetup(err) });
    } finally {
      if (!controller.signal.aborted) setClassifying(false);
    }
  };

  const submit = async () => {
    if (!draft || draft.cents == null || saving) {
      if (draft && draft.cents == null) toast.info(t("logbar.needAmount"));
      return;
    }
    const target = category ?? OTHER;
    setSaving(true);
    try {
      const now = new Date();
      const [tx] = await addTxs(runtime, client, [
        {
          date: addDays(dateKey(now), draft.dayOffset),
          time: draft.dayOffset ? "12:00" : timeKey(now),
          cents: draft.cents,
          category: target,
          note: draft.note,
          // 关键词识别的不占记忆；没选分类记到「其他」也不记
          remember: picked != null,
        },
      ]);
      if (context.signal.aborted) return;
      const name = config.categories.find(c => c.id === target)?.name ?? t("common.otherCategory");
      const after = catLeft(target, draft.cents);
      const parts = [t("logbar.saved", { name: draft.note || name, amount: yuan(draft.cents) })];
      if (after != null)
        parts.push(
          after < 0
            ? t("logbar.catOver", { cat: name, amount: yuan(-after) })
            : t("logbar.catLeft", { cat: name, amount: yuan(after) })
        );
      toast.success(parts.join(" · "), {
        action: { label: t("common.undo"), onClick: () => void removeWithUndo(runtime, client, tx, t) },
      });
      change("");
      onSaved?.(tx);
    } catch {
      toast.error(t("common.logFailed"));
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
    for (const tx of [...recent].reverse()) {
      if (tx.recurringId || !tx.note || seen.has(tx.note)) continue;
      seen.add(tx.note);
      out.push(tx.note);
      if (out.length >= 8) break;
    }
    return out;
  }, [recent]);
  const chipList = chips.length ? chips : EXAMPLES;
  const showPreview = draft != null && focused;

  return (
    <div data-kb-optout="true" className="ex:bg-page ex:shrink-0 ex:px-3 ex:py-2">
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
              onClick={() => fill(chips.length ? `${note} ` : note)}
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
          placeholder={t("logbar.placeholder")}
          aria-label={t("quick.aria")}
          className="ex:placeholder:text-ink-3 ex:min-w-0 ex:flex-1 ex:bg-transparent ex:text-[15px] ex:outline-none"
        />
        {text.trim() ? (
          <button
            type="button"
            aria-label={t("quick.submitAria")}
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
            aria-label={t("logbar.micAria")}
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
  aiError: { key: MessageKey; setup: boolean } | null;
  onPick(id: string): void;
  onClassify(): void;
  onOpenAI(): void;
}) {
  const { t } = useI18n(messages);
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
  const dayWord = draft.dayOffset === -1 ? t("date.yesterday") : t("date.dayBefore");
  const note =
    draft.dayOffset !== 0 ? (
      <>
        <Calendar className="ex:size-[11px]" />
        {t("quick.dayPrefix", { day: `${dayWord} · ${dayLabel(t, date)}` })}
        {cat ? ` · ${cat.name}` : ""}
      </>
    ) : !cat ? (
      draft.note ? t("logbar.pickHint", { note: draft.note }) : t("logbar.pickHintPlain")
    ) : (
      <>
        <History className="ex:size-[11px]" />
        {cat.name} · {source === "alias" ? t("logbar.byAlias") : source === "picked" ? t("logbar.byPicked") : t("logbar.byKeyword")}
      </>
    );

  return (
    <div className="ex:bg-surface ex:shadow-float ex:mb-2 ex:rounded-[20px] ex:px-3.5 ex:py-3">
      <div className="ex:flex ex:items-center ex:gap-2.5">
        <button type="button" aria-label={t("logbar.switchCatAria")} onClick={() => setChoosing(v => !v)} onPointerDown={e => e.preventDefault()}>
          <CatIcon category={cat} size={34} />
        </button>
        <span className="ex:min-w-0 ex:flex-1">
          <b className="ex:block ex:truncate ex:text-[15px] ex:font-semibold">{draft.note || <span className="ex:text-ink-3">{t("quick.noNote")}</span>}</b>
          <small className="ex:text-ink-3 ex:flex ex:items-center ex:gap-1 ex:truncate ex:text-[11px]">{note}</small>
        </span>
        {cents != null ? (
          <b className="ex:shrink-0 ex:text-[20px] ex:font-[750] ex:tabular-nums">{yuan(cents)}</b>
        ) : (
          <span className="ex:text-warn ex:shrink-0 ex:text-[12.5px]">{t("quick.missingAmount")}</span>
        )}
      </div>
      {showChips ? (
        <div className="ex:mt-2.5 ex:flex ex:flex-wrap ex:gap-1.5" role="radiogroup" aria-label={t("common.category")}>
          {draft.note && !cat && (
            <button
              type="button"
              disabled={classifying}
              onPointerDown={e => e.preventDefault()}
              onClick={aiError?.setup ? onOpenAI : onClassify}
              className="ex:bg-accent-soft ex:text-accent-text ex:flex ex:h-8 ex:items-center ex:gap-1 ex:rounded-full ex:px-3 ex:text-[12.5px] ex:font-semibold ex:disabled:opacity-60"
            >
              <Sparkles className={cn("ex:size-[13px]", classifying && "ex:animate-pulse")} />
              {aiError?.setup ? t("common.configureModel") : classifying ? t("quick.classifying") : t("quick.aiClassify")}
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
          {aiError && !aiError.setup && <span className="ex:text-ink-3 ex:basis-full ex:text-[11.5px]">{t("quick.errorHint", { message: t(aiError.key) })}</span>}
        </div>
      ) : catAfter != null && catAfter < 0 ? (
        <div className="ex:border-line-2 ex:text-danger ex:mt-2.5 ex:flex ex:items-center ex:gap-1.5 ex:border-t ex:pt-2.5 ex:text-[12px]">
          <TriangleAlert className="ex:size-[13px] ex:shrink-0" />
          {catStat!.spent > cat!.budget
            ? t("logbar.alreadyOver", { cat: cat!.name, over: yuan(catStat!.spent - cat!.budget), after: yuan(-catAfter) })
            : t("logbar.willOver", { cat: cat!.name, amount: yuan(-catAfter) })}
        </div>
      ) : catAfter != null && cat ? (
        <div className="ex:border-line-2 ex:text-ink-2 ex:mt-2.5 ex:flex ex:items-center ex:gap-2 ex:border-t ex:pt-2.5 ex:text-[12px]">
          <span className="ex:shrink-0">{t("logbar.catLeft", { cat: cat.name, amount: yuan(catAfter) })}</span>
          <Bar
            className="ex:h-1.5 ex:flex-1"
            ratio={catStat!.spent / cat.budget}
            adding={cents! / cat.budget}
            pace={date === today ? stat.pace : null}
          />
          {monthAfter != null && (
            <span className="ex:shrink-0">{t("logbar.monthAfter", { amount: yuan(monthAfter) })}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TalkPanel({ talk }: { talk: HoldToTalk }) {
  const { t } = useI18n(messages);
  return (
    <div className="ex:bg-surface ex:shadow-float ex:mb-2 ex:rounded-[20px] ex:px-3.5 ex:pt-4 ex:pb-3.5 ex:text-center">
      <p className="ex:min-h-[44px] ex:text-left ex:text-[15px] ex:leading-[1.6] ex:font-semibold">
        {talk.preview || <span className="ex:text-ink-3 ex:font-normal">{talk.connecting ? t("talk.connecting") : t("talk.hint")}</span>}
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
        {talk.cancelArmed ? t("talk.cancelHint") : t("talk.sendHint")}
      </p>
    </div>
  );
}
