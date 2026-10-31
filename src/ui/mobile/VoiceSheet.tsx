/**
 * 语音记账：识别出的一段话先按本地规则拆成几笔，配了模型时交给 AI 重新拆句、归类并给一句提醒；
 * 每笔可改金额、分类，× 去掉；缺金额的要先补上或去掉，「全部记下」一次写入。
 * 没配模型或 AI 失败时保留本地结果，说明只显示一行。整理期间用户改过或去掉过某笔时，AI 结果回来只补提醒，不覆盖列表。
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Info, Sparkles, X } from "lucide-react";
import { cn, toast } from "@tau/ui";
import { aiErrorMessage } from "../../ai";
import { addDays, formatYuan, parseYuan, type Config } from "../../data/model";
import type { MonthStat } from "../../data/stats";
import { splitSpeech, type VoiceItem } from "../../data/voice";
import { useRuntime } from "../../runtime";
import { yuan } from "../bits";
import { useAliases } from "../queries";
import { PartialAddError, addTxs } from "./actions";
import { AmountDisplay, AmountPad, CatIcon, CategoryGrid, PrimaryButton } from "./parts";
import { Sheet } from "./Sheet";

export interface VoiceRequest {
  text: string;
  today: string;
  now: string;
}

type Phase = { state: "organizing" } | { state: "ready"; advice: string } | { state: "local"; reason: string };

export function VoiceSheet({ request, config, stat, onClose }: { request: VoiceRequest | null; config: Config; stat: MonthStat; onClose(): void }) {
  const runtime = useRuntime();
  const client = useQueryClient();
  const aliases = useAliases();
  const [items, setItems] = useState<VoiceItem[]>([]);
  const [phase, setPhase] = useState<Phase>({ state: "organizing" });
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    if (!request) return;
    setItems(splitSpeech(request.text, config.categories, aliases.data ?? {}));
    setPhase({ state: "organizing" });
    setEditing(null);
    touched.current = false;
    const controller = new AbortController();
    const tight = stat.categories
      .filter(c => c.status !== "ok")
      .map(c => config.categories.find(x => x.id === c.id)?.name)
      .filter((name): name is string => name != null);
    runtime.ai
      .organize(request.text, config.categories, { left: stat.budget > 0 ? stat.budget - stat.total : null, daysLeft: stat.daysLeft, tight }, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (!touched.current) setItems(result.items);
        setPhase({ state: "ready", advice: result.advice });
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        const message = aiErrorMessage(error);
        if (message === null) return;
        setPhase({ state: "local", reason: `${message}，已按句子拆开、用本地规则归类。` });
      });
    return () => controller.abort();
    // 只在新的一段话进来时整理；分类、记忆变化不重新请求
  }, [request]);

  const patch = (index: number, next: Partial<VoiceItem>) => {
    touched.current = true;
    setItems(list => list.map((item, i) => (i === index ? { ...item, ...next } : item)));
  };
  const drop = (index: number) => {
    touched.current = true;
    setItems(list => list.filter((_, i) => i !== index));
  };
  const missing = items.filter(i => i.cents == null).length;
  const total = items.reduce((s, i) => s + (i.cents ?? 0), 0);
  const organizing = phase.state === "organizing";

  const save = async () => {
    if (!request || !items.length || missing || saving) return;
    setSaving(true);
    try {
      await addTxs(
        runtime,
        client,
        items.map(item => ({
          date: addDays(request.today, item.dayOffset),
          time: item.dayOffset ? "12:00" : request.now,
          cents: item.cents!,
          category: item.category,
          note: item.note,
          remember: item.source === "ai" || item.source === "picked",
        }))
      );
      toast.success(`已记下 ${items.length} 笔 · ${yuan(total)}`);
      onClose();
    } catch (error) {
      if (error instanceof PartialAddError) {
        // 去掉已经记下的几笔，再点「全部记下」只记剩下的
        touched.current = true;
        setItems(list => list.slice(error.saved));
        toast.error(error.message);
      } else toast.error("记录失败");
    } finally {
      setSaving(false);
    }
  };

  const editingItem = editing != null ? items[editing] : null;
  if (editingItem && editing != null)
    return (
      <Sheet
        open={request != null}
        onClose={() => setEditing(null)}
        title={editingItem.note}
        trailing={
          <button type="button" onClick={() => setEditing(null)} className="ex:text-accent-text ex:h-8 ex:px-1 ex:text-[13.5px] ex:font-semibold">
            完成
          </button>
        }
      >
        <ItemEditor item={editingItem} config={config} onChange={next => patch(editing, next)} />
      </Sheet>
    );

  return (
    <Sheet
      open={request != null}
      onClose={onClose}
      title={organizing ? "正在整理" : `整理成 ${items.length} 笔`}
      trailing={organizing ? <Dots /> : null}
    >
      <p className="ex:text-ink-3 ex:mb-1.5 ex:text-[12px] ex:leading-[1.6]">
        听到：<span className="ex:text-ink-2">{request?.text}</span>
      </p>
      <ul className="ex:divide-line-2 ex:divide-y">
        {items.map((item, index) => {
          const cat = config.categories.find(c => c.id === item.category) ?? null;
          return (
            <li key={index} className="ex:flex ex:min-h-[52px] ex:items-center ex:gap-2.5">
              <button type="button" onClick={() => {
                  // 打开编辑后 AI 结果不再替换列表，序号不会错位
                  touched.current = true;
                  setEditing(index);
                }} className="ex:flex ex:min-w-0 ex:flex-1 ex:items-center ex:gap-2.5 ex:text-left">
                <CatIcon category={cat} />
                <span className="ex:min-w-0 ex:flex-1">
                  <span className="ex:block ex:truncate ex:text-[14px]">{item.note}</span>
                  <small className={cn("ex:block ex:truncate ex:text-[11px]", item.cents == null ? "ex:text-danger" : "ex:text-ink-3")}>
                    {item.cents == null
                      ? "没听到金额"
                      : [item.dayOffset === -1 ? "昨天" : item.dayOffset === -2 ? "前天" : "今天", cat?.name, item.source === "ai" ? "AI 归类，点一下可改" : null]
                          .filter(Boolean)
                          .join(" · ")}
                  </small>
                </span>
                {item.cents == null ? (
                  <span className="ex:bg-accent-soft ex:text-accent-text ex:flex ex:h-7 ex:shrink-0 ex:items-center ex:rounded-full ex:px-[11px] ex:text-[12.5px] ex:font-[650]">
                    填金额
                  </span>
                ) : (
                  <b className="ex:shrink-0 ex:text-[14px] ex:font-[650] ex:tabular-nums">{yuan(item.cents)}</b>
                )}
              </button>
              <button
                type="button"
                aria-label={`去掉 ${item.note}`}
                onClick={() => drop(index)}
                className="ex:text-ink-3 ex:grid ex:size-8 ex:shrink-0 ex:place-items-center"
              >
                <X className="ex:size-[15px]" />
              </button>
            </li>
          );
        })}
        {!items.length && <li className="ex:text-ink-3 ex:py-5 ex:text-center ex:text-[12.5px]">没整理出可记的花费，重新说一次试试</li>}
      </ul>
      {phase.state === "local" ? (
        <div className="ex:bg-hover ex:text-ink-2 ex:my-3 ex:flex ex:gap-2 ex:rounded-[14px] ex:px-3 ex:py-2.5 ex:text-[12.5px] ex:leading-[1.7]">
          <Info className="ex:text-ink-3 ex:mt-[3px] ex:size-3.5 ex:shrink-0" />
          <span>{phase.reason}</span>
        </div>
      ) : (
        <div
          className={cn(
            "ex:my-3 ex:flex ex:gap-2 ex:rounded-[14px] ex:px-3 ex:py-2.5 ex:text-[12.5px] ex:leading-[1.7]",
            organizing ? "ex:bg-hover ex:text-ink-3" : "ex:bg-accent-soft ex:text-ink-1"
          )}
        >
          <Sparkles className="ex:text-accent-text ex:mt-[3px] ex:size-3.5 ex:shrink-0" />
          <span>{organizing ? "AI 正在归类…" : phase.advice || "已按你说的整理好。"}</span>
        </div>
      )}
      <PrimaryButton disabled={!items.length || missing > 0 || saving} onClick={() => void save()}>
        {missing > 0 ? `${missing} 笔没有金额，先填上或去掉` : `${organizing ? "先记下" : "全部记下"} · ${yuan(total)}`}
      </PrimaryButton>
    </Sheet>
  );
}

/** 一笔的金额与分类：上方大号金额 + 键盘，下方分类宫格 */
function ItemEditor({ item, config, onChange }: { item: VoiceItem; config: Config; onChange(next: Partial<VoiceItem>): void }) {
  const [amount, setAmount] = useState(item.cents != null ? formatYuan(item.cents).replace(/,/g, "") : "");
  return (
    <>
      <AmountDisplay value={amount} caret />
      <AmountPad
        value={amount}
        onChange={value => {
          setAmount(value);
          onChange({ cents: parseYuan(value) });
        }}
      />
      <CategoryGrid categories={config.categories} value={item.category} onChange={category => onChange({ category, source: "picked" })} />
    </>
  );
}

function Dots() {
  return (
    <span aria-hidden className="ex:inline-flex ex:gap-[3px]">
      {[0, 1, 2].map(i => (
        <i key={i} className="ex:bg-ink-3 ex:size-[5px] ex:animate-pulse ex:rounded-full" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}
