/**
 * 手机设置：分类与月预算、固定支出两段列表，点一行在底部面板里改；编辑在草稿里进行，保存才写入，
 * 删除分类时它的流水移到「其他」；「按前 3 个月平均填入」与桌面相同。
 * 在插件详情的设置里由 Tau 提供保存条与离开确认；作为插件页打开时（主页齿轮）有 pageContext：
 * 面板接系统返回，自带保存按钮，有改动没保存时离开先确认。
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSettingsDraft, type PluginPageContext } from "@tau/plugins";
import { ChevronRight, History, Plus, Trash2 } from "lucide-react";
import { Loading, cn, toast } from "@tau/ui";
import {
  MAX_CATEGORIES,
  OTHER,
  formatYuan,
  monthOf,
  nextColor,
  parseYuan,
  type Category,
  type Config,
  type Recurring,
  configToJson,
  parseConfig,
} from "../../data/model";
import { baseline } from "../../data/stats";
import { configChanges } from "../../data/changes";
import { EXPENSE_KEY, useRuntime } from "../../runtime";
import { ICONS, yuan } from "../bits";
import { useConfig, useLedger, useNow } from "../queries";
import { AmountDisplay, AmountPad, CatIcon, PrimaryButton } from "./parts";
import { Sheet, SheetHost } from "./Sheet";

const ROW = "ex:flex ex:min-h-[50px] ex:w-full ex:items-center ex:gap-2.5 ex:text-left ex:text-[14.5px]";
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

type Editing = { kind: "cat"; index: number | null } | { kind: "rec"; index: number | null };

export function MobileSettings({ pageContext }: { pageContext?: PluginPageContext }) {
  const { data, context } = useRuntime();
  const client = useQueryClient();
  const config = useConfig();
  const { today } = useNow();
  const ledger = useLedger(monthOf(today), today);
  const [draft, setDraft] = useState<Config | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (config.isSuccess && draft == null) setDraft(structuredClone(config.data));
  }, [config.isSuccess, config.data, draft]);

  // 草稿与已保存的都经同一次解析再比，字段顺序不同不算改动
  const dirty = draft != null && config.data != null && fingerprint(draft) !== fingerprint(config.data);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  // 离开确认：宿主等这个 Promise 期间锁住返回，所以组件卸载时一定放行，确认框只靠按钮与遮罩关闭
  const [asking, setAsking] = useState(false);
  const resolver = useRef<((leave: boolean) => void) | null>(null);
  useEffect(() => {
    if (!pageContext) return;
    const guard = pageContext.registerLeaveGuard(() => {
      if (!dirtyRef.current) return true;
      resolver.current?.(false);
      setAsking(true);
      return new Promise<boolean>(resolve => (resolver.current = resolve));
    });
    return () => {
      guard.dispose();
      resolver.current?.(true);
      resolver.current = null;
    };
  }, [pageContext]);
  const answerLeave = (leave: boolean) => {
    resolver.current?.(leave);
    resolver.current = null;
    setAsking(false);
  };

  const commit = async () => {
    if (!draft) return;
    let moved = 0;
    for (const id of removed) moved += await data.moveCategory(id, OTHER);
    await data.saveConfig(draft);
    if (context.signal.aborted) return;
    await client.invalidateQueries({ queryKey: EXPENSE_KEY });
    setDraft(parseConfig(configToJson(draft)));
    setRemoved([]);
    return moved ? `已保存，${moved} 笔流水移到了「其他」` : undefined;
  };
  const restore = () => {
    setDraft(structuredClone(config.data!));
    setRemoved([]);
  };
  const hostDraft = useSettingsDraft({
    dirty: dirty || removed.length > 0,
    changes: draft && config.data ? configChanges(config.data, draft) : [],
    save: commit,
    reset: restore,
  });

  if (!draft) return <Loading minHeight={160} />;
  const base = ledger.data ? baseline(ledger.data.history, monthOf(today)) : [];
  const average = (id: string) => (base.length ? base.reduce((s, m) => s + (m.byCategory[id] ?? 0), 0) / base.length : null);
  const total = draft.categories.reduce((s, c) => s + c.budget, 0);

  const save = async (): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    try {
      const text = await commit();
      toast.success(text ?? "已保存");
      return true;
    } catch {
      toast.error("保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const fillFromHistory = () =>
    setDraft({
      ...draft,
      // 取整到 50 元，看起来像人定的预算
      categories: draft.categories.map(c => {
        const avg = average(c.id);
        return avg && avg > 0 ? { ...c, budget: Math.ceil(avg / 5000) * 5000 } : c;
      }),
    });

  const putCat = (index: number | null, next: Category) => {
    const list = [...draft.categories];
    if (index == null) {
      const k = list.findIndex(c => c.id === OTHER);
      list.splice(k < 0 ? list.length : k, 0, next);
    } else list[index] = next;
    setDraft({ ...draft, categories: list });
  };
  const removeCat = (index: number) => {
    const c = draft.categories[index];
    setDraft({
      categories: draft.categories.filter((_, k) => k !== index),
      recurring: draft.recurring.map(r => (r.category === c.id ? { ...r, category: OTHER } : r)),
    });
    if (config.data?.categories.some(x => x.id === c.id)) setRemoved([...removed, c.id]);
  };
  const putRec = (index: number | null, next: Recurring) => {
    const list = [...draft.recurring];
    if (index == null) list.push(next);
    else list[index] = next;
    setDraft({ ...draft, recurring: list });
  };

  const editingCat = editing?.kind === "cat" ? (editing.index == null ? null : draft.categories[editing.index]) : undefined;
  const editingRec = editing?.kind === "rec" ? (editing.index == null ? null : draft.recurring[editing.index]) : undefined;

  return (
    <SheetHost.Provider value={pageContext ?? null}>
    <div className="ex:flex ex:flex-col ex:gap-2.5 ex:pb-2">
      <h3 className="ex:text-ink-3 ex:px-1 ex:text-[12px]">分类与月预算 · 合计 {yuan(total)}</h3>
      <div className="ex:divide-line-2 ex:divide-y">
        {draft.categories.map((c, i) => (
          <button key={c.id} type="button" className={ROW} onClick={() => setEditing({ kind: "cat", index: i })}>
            <CatIcon category={c} size={26} />
            <span className="ex:min-w-0 ex:flex-1 ex:truncate">{c.name}</span>
            <b className={cn("ex:font-semibold ex:tabular-nums", !c.budget && "ex:text-ink-3 ex:font-normal")}>{c.budget ? yuan(c.budget) : "不设"}</b>
            <ChevronRight className="ex:text-ink-3 ex:size-4" />
          </button>
        ))}
      </div>
      <div className="ex:flex ex:gap-2">
        {draft.categories.length < MAX_CATEGORIES && (
          <PrimaryButton small ghost className="ex:flex-1" onClick={() => setEditing({ kind: "cat", index: null })}>
            <Plus />
            新增分类
          </PrimaryButton>
        )}
        {base.length > 0 && (
          <PrimaryButton small ghost className="ex:flex-[1.4]" onClick={fillFromHistory}>
            <History />
            按前 {base.length} 个月平均填入
          </PrimaryButton>
        )}
      </div>
      {removed.length > 0 && <p className="ex:text-ink-3 ex:px-1 ex:text-[12px]">删除的分类里的流水，保存后会移到「其他」。</p>}

      <h3 className="ex:text-ink-3 ex:mt-3 ex:px-1 ex:text-[12px]">固定支出 · 每月自动记一笔</h3>
      <div className="ex:divide-line-2 ex:divide-y">
        {draft.recurring.map((r, i) => {
          const cat = draft.categories.find(c => c.id === r.category) ?? null;
          return (
            <button key={r.id} type="button" className={ROW} onClick={() => setEditing({ kind: "rec", index: i })}>
              <CatIcon category={cat} size={26} />
              <span className="ex:min-w-0 ex:flex-1 ex:truncate">{r.note}</span>
              <span className="ex:text-ink-3 ex:text-[12.5px]">每月 {r.day} 号</span>
              <b className="ex:font-semibold ex:tabular-nums">{yuan(r.cents)}</b>
              <ChevronRight className="ex:text-ink-3 ex:size-4" />
            </button>
          );
        })}
        {!draft.recurring.length && <p className="ex:text-ink-3 ex:py-3 ex:text-[12.5px]">房租、话费、会员这类每月不变的，填一次到日子自动记一笔，不计入月历和日均。</p>}
      </div>
      <PrimaryButton small ghost onClick={() => setEditing({ kind: "rec", index: null })}>
        <Plus />
        新增固定支出
      </PrimaryButton>

      {!hostDraft && (
        <div className="ex:mt-3 ex:flex ex:gap-2">
          {dirty && (
            <PrimaryButton ghost className="ex:flex-1" onClick={restore}>
              还原
            </PrimaryButton>
          )}
          <PrimaryButton className="ex:flex-[2]" disabled={!dirty || saving} onClick={() => void save()}>
            {dirty ? "保存" : "已保存"}
          </PrimaryButton>
        </div>
      )}

      {editingCat !== undefined && editing?.kind === "cat" && (
        <CategorySheet
          category={editingCat}
          average={editingCat ? average(editingCat.id) : null}
          nextColor={nextColor(draft.categories)}
          onClose={() => setEditing(null)}
          onSave={next => {
            putCat(editing.index, next);
            setEditing(null);
          }}
          onDelete={
            editingCat && editingCat.id !== OTHER && editing.index != null
              ? () => {
                  removeCat(editing.index!);
                  setEditing(null);
                }
              : null
          }
        />
      )}
      {editingRec !== undefined && editing?.kind === "rec" && (
        <RecurringSheet
          rule={editingRec}
          categories={draft.categories}
          today={today}
          onClose={() => setEditing(null)}
          onSave={next => {
            putRec(editing.index, next);
            setEditing(null);
          }}
          onDelete={
            editing.index != null
              ? () => {
                  setDraft({ ...draft, recurring: draft.recurring.filter((_, k) => k !== editing.index) });
                  setEditing(null);
                }
              : null
          }
        />
      )}
      <Sheet open={asking} onClose={() => answerLeave(false)} title="有改动还没保存">
        <p className="ex:text-ink-2 ex:mt-1 ex:text-[13px]">离开后这次的修改不会保留。</p>
        <div className="ex:mt-4 ex:flex ex:gap-2">
          <PrimaryButton ghost className="ex:flex-1" onClick={() => answerLeave(true)}>
            不保存，离开
          </PrimaryButton>
          <PrimaryButton
            className="ex:flex-1"
            onClick={() =>
              void save().then(ok => ok && answerLeave(true))
            }
          >
            保存
          </PrimaryButton>
        </div>
      </Sheet>
    </div>
    </SheetHost.Provider>
  );
}

const fingerprint = (config: Config) => JSON.stringify(configToJson(parseConfig(configToJson(config))));

const toYuanText = (cents: number) => (cents ? formatYuan(cents).replace(/,/g, "") : "");

function CategorySheet({
  category,
  average,
  nextColor: color,
  onClose,
  onSave,
  onDelete,
}: {
  /** null 为新增 */
  category: Category | null;
  average: number | null;
  nextColor: number;
  onClose(): void;
  onSave(next: Category): void;
  onDelete: (() => void) | null;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "tag");
  const [budget, setBudget] = useState(toYuanText(category?.budget ?? 0));
  const [padding, setPadding] = useState(false);
  const cents = budget ? parseYuan(budget) : 0;
  const valid = name.trim().length > 0 && cents != null;
  const current = { icon, color: category?.color ?? color };
  return (
    <Sheet
      open
      onClose={onClose}
      title={category ? category.name : "新增分类"}
      trailing={
        padding ? (
          <button type="button" onClick={() => setPadding(false)} className="ex:text-accent-text ex:h-8 ex:px-1 ex:text-[13.5px] ex:font-semibold">
            完成
          </button>
        ) : onDelete ? (
          <button type="button" aria-label="删除分类" onClick={onDelete} className="ex:text-danger ex:grid ex:size-8 ex:place-items-center">
            <Trash2 className="ex:size-[18px]" />
          </button>
        ) : null
      }
    >
      {padding ? (
        <>
          <AmountDisplay value={budget} placeholder="不设" caret />
          {average != null && <p className="ex:text-ink-3 ex:mb-3 ex:text-center ex:text-[12px]">前 3 个月平均 {yuan(average)} · 清空表示不设</p>}
          <AmountPad value={budget} onChange={setBudget} />
        </>
      ) : (
        <>
          <div className="ex:divide-line-2 ex:mt-1 ex:divide-y">
            <label className={ROW}>
              <span className="ex:text-ink-3 ex:w-14 ex:shrink-0">名称</span>
              <input
                value={name}
                maxLength={12}
                onChange={e => setName(e.target.value)}
                placeholder="比如「宠物」"
                className="ex:placeholder:text-ink-3 ex:min-w-0 ex:flex-1 ex:bg-transparent ex:outline-none"
              />
            </label>
            <button type="button" className={ROW} onClick={() => setPadding(true)}>
              <span className="ex:text-ink-3 ex:w-14 ex:shrink-0">月预算</span>
              <b className={cn("ex:font-semibold ex:tabular-nums", !cents && "ex:text-ink-3 ex:font-normal")}>{cents ? yuan(cents) : "不设"}</b>
              <span className="ex:flex-1" />
              {average != null && <span className="ex:text-ink-3 ex:text-[12px]">前 3 个月平均 {yuan(average)}</span>}
            </button>
          </div>
          <p className="ex:text-ink-3 ex:mt-2.5 ex:mb-1.5 ex:text-[12px]">图标</p>
          <div className="ex:grid ex:grid-cols-6 ex:gap-1.5">
            {Object.keys(ICONS).map(key => (
              <button
                key={key}
                type="button"
                aria-label={key}
                aria-pressed={key === icon}
                onClick={() => setIcon(key)}
                className={cn("ex:grid ex:h-11 ex:place-items-center ex:rounded-[12px]", key === icon && "ex:bg-hover ex:shadow-[inset_0_0_0_1.5px_var(--tau-ink-1)]")}
              >
                <CatIcon category={key === icon ? current : null} size={32} ghost={key !== icon} />
              </button>
            ))}
          </div>
          {onDelete && <p className="ex:text-ink-3 ex:px-1 ex:pt-2.5 ex:text-[11.5px]">删除后，这一类的流水移到「其他」，金额不会丢。</p>}
        </>
      )}
      <PrimaryButton
        className="ex:mt-3"
        disabled={!valid}
        onClick={() => onSave({ id: category?.id ?? newId("c"), name: name.trim(), icon, color: category?.color ?? color, budget: cents ?? 0 })}
      >
        完成
      </PrimaryButton>
    </Sheet>
  );
}

function RecurringSheet({
  rule,
  categories,
  today,
  onClose,
  onSave,
  onDelete,
}: {
  rule: Recurring | null;
  categories: readonly Category[];
  today: string;
  onClose(): void;
  onSave(next: Recurring): void;
  onDelete: (() => void) | null;
}) {
  const [note, setNote] = useState(rule?.note ?? "");
  const [amount, setAmount] = useState(toYuanText(rule?.cents ?? 0));
  const [category, setCategory] = useState(rule?.category ?? (categories.some(c => c.id === "home") ? "home" : OTHER));
  const [day, setDay] = useState(String(rule?.day ?? 1));
  const [padding, setPadding] = useState(false);
  const [picking, setPicking] = useState(false);
  const cents = parseYuan(amount);
  const dayNum = Number(day);
  const dayOk = Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 28;
  const valid = note.trim().length > 0 && cents != null && dayOk;
  const cat = categories.find(c => c.id === category) ?? null;
  const passed = dayOk && dayNum <= Number(today.slice(8));
  return (
    <Sheet
      open
      onClose={onClose}
      title={rule ? "固定支出" : "新增固定支出"}
      trailing={
        padding || picking ? (
          <button
            type="button"
            onClick={() => {
              setPadding(false);
              setPicking(false);
            }}
            className="ex:text-accent-text ex:h-8 ex:px-1 ex:text-[13.5px] ex:font-semibold"
          >
            完成
          </button>
        ) : onDelete ? (
          <button type="button" aria-label="删除这条固定支出" onClick={onDelete} className="ex:text-danger ex:grid ex:size-8 ex:place-items-center">
            <Trash2 className="ex:size-[18px]" />
          </button>
        ) : null
      }
    >
      {padding ? (
        <>
          <AmountDisplay value={amount} caret />
          <AmountPad value={amount} onChange={setAmount} />
        </>
      ) : picking ? (
        <div className="ex:my-2 ex:grid ex:grid-cols-4 ex:gap-1.5">
          {categories.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCategory(c.id);
                setPicking(false);
              }}
              className={cn(
                "ex:flex ex:flex-col ex:items-center ex:gap-1 ex:rounded-[12px] ex:pt-[7px] ex:pb-1.5 ex:text-[11.5px]",
                c.id === category ? "ex:bg-hover ex:font-[650] ex:shadow-[inset_0_0_0_1.5px_var(--tau-ink-1)]" : "ex:text-ink-2"
              )}
            >
              <CatIcon category={c} size={32} />
              {c.name}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="ex:divide-line-2 ex:mt-1 ex:divide-y">
            <label className={ROW}>
              <span className="ex:text-ink-3 ex:w-14 ex:shrink-0">名称</span>
              <input
                value={note}
                maxLength={40}
                onChange={e => setNote(e.target.value)}
                placeholder="房租"
                className="ex:placeholder:text-ink-3 ex:min-w-0 ex:flex-1 ex:bg-transparent ex:outline-none"
              />
            </label>
            <button type="button" className={ROW} onClick={() => setPadding(true)}>
              <span className="ex:text-ink-3 ex:w-14 ex:shrink-0">金额</span>
              <b className={cn("ex:font-semibold ex:tabular-nums", cents == null && "ex:text-ink-3 ex:font-normal")}>{cents != null ? yuan(cents) : "填金额"}</b>
            </button>
            <button type="button" className={ROW} onClick={() => setPicking(true)}>
              <span className="ex:text-ink-3 ex:w-14 ex:shrink-0">分类</span>
              <CatIcon category={cat} size={24} />
              {cat?.name ?? "其他"}
              <ChevronRight className="ex:text-ink-3 ex:ml-auto ex:size-4" />
            </button>
            <label className={ROW}>
              <span className="ex:text-ink-3 ex:w-14 ex:shrink-0">每月</span>
              <input
                inputMode="numeric"
                value={day}
                onChange={e => setDay(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
                aria-label="每月几号"
                className="ex:w-10 ex:bg-transparent ex:font-semibold ex:tabular-nums ex:outline-none"
              />
              号<span className={cn("ex:ml-auto ex:text-[12px]", dayOk ? "ex:text-ink-3" : "ex:text-danger")}>1–28 号</span>
            </label>
          </div>
          <p className="ex:text-ink-3 ex:px-1 ex:pt-2 ex:text-[11.5px] ex:leading-[1.6]">
            到日子自动记一笔，单独标出，不计入月历和日均额度。
            {!rule && passed ? `本月 ${dayNum} 号已过，保存后立即补记本月这笔。` : ""}
            {rule ? "删掉后已记的流水保留。" : ""}
          </p>
        </>
      )}
      <PrimaryButton
        className="ex:mt-3"
        disabled={!valid}
        onClick={() => onSave({ id: rule?.id ?? newId("r"), note: note.trim(), cents: cents!, category, day: dayNum })}
      >
        {rule ? "完成" : "添加"}
      </PrimaryButton>
    </Sheet>
  );
}
