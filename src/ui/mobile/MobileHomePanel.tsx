/**
 * 手机「今天」页的记账小卡：本月还能花多少 + 进度条（竖线 = 时间进度），偏快时副标题变红；没设预算时显示本月已花。
 * 麦克风就地弹出语音记账，「记一笔」进记账页并聚焦记账条。
 */
import { useState } from "react";
import type { PluginHomePanelProps } from "@tau/plugins";
import { Mic, Plus } from "lucide-react";
import { cn, toast } from "@tau/ui";
import { monthOf } from "../../data/model";
import { isFixed } from "../../data/stats";
import { useRuntime } from "../../runtime";
import { yuan } from "../bits";
import { useLedger, useNow } from "../queries";
import { Bar } from "./parts";
import { SheetHost } from "./Sheet";
import { useHoldToTalk } from "./useHoldToTalk";
import { VoiceSheet, type VoiceRequest } from "./VoiceSheet";

export function MobileHomePanel({ registerDismiss }: PluginHomePanelProps) {
  const { pages } = useRuntime();
  const { today, time } = useNow();
  const query = useLedger(monthOf(today), today);
  const [voice, setVoice] = useState<VoiceRequest | null>(null);
  const talk = useHoldToTalk({ onText: text => setVoice({ text, today, now: time }), onError: message => toast.info(message) });
  if (!query.data) return null;
  const { stat, config, txs } = query.data;
  const left = stat.budget - stat.total;
  const fast = stat.budget > 0 && (left < 0 || stat.paceRatio > stat.pace);
  const todaySpent = txs.filter(t => t.date === today && !isFixed(t)).reduce((s, t) => s + t.cents, 0);

  const button = "ex:flex ex:h-8 ex:items-center ex:justify-center ex:gap-1 ex:rounded-[10px] ex:text-[12px] ex:font-semibold ex:[&>svg]:size-[13px]";
  return (
    <SheetHost.Provider value={registerDismiss ? { registerDismiss } : null}>
      <div className="ex:flex ex:min-h-[96px] ex:flex-1 ex:flex-col">
        {talk.active ? (
          <p className="ex:mt-1 ex:line-clamp-3 ex:text-[13px] ex:leading-[1.5] ex:font-semibold">
            {talk.preview || <span className="ex:text-ink-3 ex:font-normal">{talk.connecting ? "正在连接…" : "说说花了什么钱"}</span>}
          </p>
        ) : (
          <>
            <b className={cn("ex:mt-1 ex:truncate ex:text-[25px] ex:leading-[1.1] ex:font-[750] ex:tracking-[-0.03em] ex:tabular-nums", left < 0 && stat.budget > 0 && "ex:text-danger")}>
              {stat.budget > 0 ? `${left < 0 ? "−" : ""}${yuan(Math.abs(left))}` : yuan(stat.total)}
            </b>
            <span className={cn("ex:mt-0.5 ex:truncate ex:text-[11.5px]", fast && left >= 0 ? "ex:text-danger" : "ex:text-ink-2")}>
              {stat.budget <= 0
                ? `本月已花 · 今天 ${yuan(todaySpent)}`
                : left < 0
                  ? `本月已超预算 · 剩 ${stat.daysLeft} 天`
                  : fast
                    ? `比时间进度快 ${Math.round((stat.paceRatio - stat.pace) * 100)}%`
                    : `本月还能花 · 剩 ${stat.daysLeft} 天`}
            </span>
            {stat.budget > 0 && <Bar className="ex:mt-[7px] ex:h-1.5" ratio={stat.total / stat.budget} pace={stat.pace} danger={fast} />}
          </>
        )}
        <span className="ex:mt-auto ex:flex ex:gap-1.5 ex:pt-2">
          <button
            type="button"
            aria-label="按住说话记一笔"
            onClick={event => event.stopPropagation()}
            {...talk.bind}
            className={cn(button, "ex:flex-1 ex:touch-none ex:select-none", talk.active ? "ex:bg-accent ex:text-ink-inverse" : "ex:bg-hover ex:text-ink-1")}
          >
            <Mic />
          </button>
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              void pages.main?.open({ add: true });
            }}
            className={cn(button, "ex:bg-accent-soft ex:text-accent-text ex:flex-[2.4]")}
          >
            <Plus />
            记一笔
          </button>
        </span>
      </div>
      <VoiceSheet request={voice} config={config} stat={stat} onClose={() => setVoice(null)} />
    </SheetHost.Provider>
  );
}
