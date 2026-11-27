/**
 * 手机记账主页：入口条（月历 / 回顾与 AI / 设置）→ 主卡 → 分类预算（4 类）→ 按天分组的流水，页底固定记账条。
 * 插件不能往宿主顶栏加按钮，二级页入口放在内容顶部一行。主卡滚出屏幕后顶部吸住一行余额。
 * 参数 add 聚焦记账条（字符串时预填），每个页面实例只处理一次。
 * 二级页（月历、分类、回顾、搜索）单独注册，见 MobileViews。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n, type PluginPageProps } from "@tau/plugins";
import { CalendarDays, ChartColumn, Settings, SlidersHorizontal } from "lucide-react";
import { Loading, cn } from "@tau/ui";
import { addDays, monthOf, type Tx } from "../../data/model";
import { byCategory, isFixed, samePeriodTotal } from "../../data/stats";
import { EXPENSE_KEY, useRuntime } from "../../runtime";
import { messages } from "../../i18n";
import { yuan } from "../bits";
import { useLedger, useNow } from "../queries";
import { removeWithUndo } from "./actions";
import { CategoryCard, HeroCard, MORE_DAYS, MiniHero, TxCard } from "./HomeCards";
import { LogBar, type LogBarHandle } from "./LogBar";
import { SheetHost } from "./Sheet";
import { TxSheet } from "./TxSheet";
import { VoiceSheet, type VoiceRequest } from "./VoiceSheet";

const HIGHLIGHT_MS = 2400;

export function MobileExpensePage({ params, pageContext }: PluginPageProps) {
  const runtime = useRuntime();
  const { t, locale } = useI18n(messages);
  const { pages, data } = runtime;
  const client = useQueryClient();
  const { today } = useNow();
  const current = monthOf(today);
  const query = useLedger(current, today);
  const saved = useQuery({ queryKey: [...EXPENSE_KEY, "saved"], queryFn: () => data.hasSavedConfig() });
  const [editing, setEditing] = useState<Tx | null>(null);
  const [voice, setVoice] = useState<VoiceRequest | null>(null);
  const [dayLimit, setDayLimit] = useState(2);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [heroHidden, setHeroHidden] = useState(false);
  const logRef = useRef<LogBarHandle>(null);
  const handledAddRef = useRef(false);
  const heroRef = useRef<HTMLDivElement>(null);

  const ready = query.data != null;
  // 入口动作只在本实例执行一次；重新打开自身会新增历史，返回时又触发入口动作。
  const addParam = params.add === true ? "" : typeof params.add === "string" ? params.add : null;
  useEffect(() => {
    if (!ready || addParam == null || handledAddRef.current || !logRef.current) return;
    handledAddRef.current = true;
    logRef.current.fill(addParam);
  }, [addParam, ready]);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setHeroHidden(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ready]);

  const derived = useMemo(() => {
    const d = query.data;
    if (!d) return null;
    const flex = (list: readonly Tx[]) => list.filter(t => !isFixed(t));
    const todayTxs = flex(d.txs.filter(t => t.date === today));
    const lastSame = samePeriodTotal(d.txs, today);
    // 比上月同期多出最多的分类
    const thisBy = byCategory(d.txs.filter(t => monthOf(t.date) === current));
    const end = `${lastSame.month}-${today.slice(8, 10)}`;
    const lastBy = byCategory(d.txs.filter(t => monthOf(t.date) === lastSame.month && t.date <= end));
    const top = Object.entries(thisBy)
      .map(([id, cents]) => ({ id, cents: cents - (lastBy[id] ?? 0) }))
      .sort((a, b) => b.cents - a.cents)[0];
    const topName = top && top.cents > 0 ? d.config.categories.find(c => c.id === top.id)?.name : null;
    return {
      today: { cents: todayTxs.reduce((s, t) => s + t.cents, 0), count: todayTxs.length },
      yesterday: flex(d.txs.filter(t => t.date === addDays(today, -1))).reduce((s, t) => s + t.cents, 0),
      lastSame,
      topDiff: topName ? { name: topName, cents: top.cents } : null,
      recent: d.txs.filter(t => t.date >= addDays(today, -60)),
      monthTxs: d.txs.filter(t => monthOf(t.date) === current),
    };
  }, [query.data, today, current]);

  if (query.isError) return <div className="ex:text-ink-3 ex:grid ex:h-60 ex:place-items-center ex:text-[13px]">{t("common.loadFailed")}</div>;
  if (!query.data || !derived) return <Loading minHeight={240} />;
  const { stat, config, txs } = query.data;
  const fresh = saved.data === false && derived.monthTxs.length < 5 && txs.length < 5;
  const spentOf = (category: string, month: string) => txs.filter(t => t.category === category && monthOf(t.date) === month).reduce((s, t) => s + t.cents, 0);

  const flash = (tx: Tx) => {
    setHighlight(tx.id);
    window.setTimeout(() => setHighlight(id => (id === tx.id ? null : id)), HIGHLIGHT_MS);
  };

  return (
    <SheetHost.Provider value={pageContext}>
      {/* 宿主外壳随键盘收缩：内容区滚动，记账条贴在可见区底部 */}
      <div className="ex:-mx-4 ex:flex ex:min-h-full ex:flex-col">
        <div className="ex:flex ex:flex-1 ex:flex-col ex:gap-3 ex:px-4 ex:pt-1 ex:pb-4">
          <div className="ex:flex ex:gap-1.5">
            <EntryButton icon={<CalendarDays />} label={t("app.page.calendar")} onClick={() => void pages.calendar?.open({})} />
            <EntryButton icon={<ChartColumn />} label={t("app.page.review")} onClick={() => void pages.review?.open()} />
            <span className="ex:flex-1" />
            <EntryButton icon={<Settings />} label={t("common.settings")} onClick={() => void pages.settings?.open()} iconOnly />
          </div>
          <div
            className={cn(
              "ex:sticky ex:top-0 ex:z-[3] ex:-mx-4 ex:-mb-3 ex:h-0 ex:px-4 ex:transition-opacity ex:duration-200",
              heroHidden ? "ex:opacity-100" : "ex:pointer-events-none ex:opacity-0"
            )}
          >
            <div className="ex:pt-1">
              <MiniHero stat={stat} today={derived.today.cents} />
            </div>
          </div>
          <div ref={heroRef}>
            <HeroCard stat={stat} today={derived.today} yesterday={derived.yesterday} lastSame={derived.lastSame} topDiff={derived.topDiff} />
          </div>
          {fresh ? (
            <button
              type="button"
              onClick={() => void pages.settings?.open()}
              className="ex:bg-accent-soft ex:text-accent-text ex:flex ex:items-center ex:gap-2.5 ex:rounded-[14px] ex:px-3 ex:py-2.5 ex:text-left ex:text-[12.5px] ex:leading-[1.5]"
            >
              <SlidersHorizontal className="ex:size-[17px] ex:shrink-0" />
              <span className="ex:flex-1">{t("mobile.freshTip")}</span>
              <b className="ex:shrink-0 ex:font-[650]">{t("common.goSettings")}</b>
            </button>
          ) : (
            <CategoryCard
              stat={stat}
              categories={config.categories}
              limit={4}
              onOpen={id => void pages.category?.open({ id })}
              onOpenAll={() => void pages.categories?.open()}
            />
          )}
          <TxCard
            note={t("mobile.monthTxNote", { month: Number(current.slice(5)), count: derived.monthTxs.length })}
            txs={derived.recent}
            categories={config.categories}
            today={today}
            dayLimit={dayLimit}
            onMore={() => setDayLimit(n => n + MORE_DAYS)}
            onEdit={setEditing}
            onDelete={tx => void removeWithUndo(runtime, client, tx, t)}
            onSearch={() => void pages.search?.open()}
            highlight={highlight}
            empty={
              <p className="ex:text-ink-3 ex:py-6 ex:text-center ex:text-[12.5px] ex:leading-[1.7]">
                <b className="ex:text-ink-1 ex:mb-1 ex:block ex:text-[14px] ex:font-semibold">{t("mobile.emptyTitle")}</b>
                {t("mobile.emptyHint1")}
                <br />
                {t("mobile.emptyHint2")}
              </p>
            }
          />
          {derived.recent.length > 0 && dayLimit >= new Set(derived.recent.map(tx => tx.date)).size && (
            <p className="ex:text-ink-3 ex:text-center ex:text-[11.5px]">{t("mobile.footnote", { amount: yuan(stat.flex) })}</p>
          )}
        </div>
        <div className="ex:sticky ex:bottom-0 ex:z-[2]">
          <LogBar
            ref={logRef}
            today={today}
            config={config}
            stat={stat}
            recent={derived.recent}
            onVoice={text => setVoice({ text })}
            onSaved={flash}
          />
        </div>
      </div>
      <TxSheet tx={editing} categories={config.categories} today={today} spentOf={spentOf} onClose={() => setEditing(null)} />
      <VoiceSheet request={voice} config={config} stat={stat} onClose={() => setVoice(null)} />
    </SheetHost.Provider>
  );
}

function EntryButton({ icon, label, onClick, iconOnly }: { icon: React.ReactNode; label: string; onClick(): void; iconOnly?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "ex:bg-surface ex:shadow-card ex:text-ink-2 ex:flex ex:h-9 ex:items-center ex:gap-1.5 ex:rounded-[12px] ex:text-[13px] ex:font-semibold ex:active:bg-press ex:[&>svg]:size-4",
        iconOnly ? "ex:w-9 ex:justify-center" : "ex:px-3"
      )}
    >
      {icon}
      {!iconOnly && label}
    </button>
  );
}
