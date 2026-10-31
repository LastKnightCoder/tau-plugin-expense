/**
 * 设置：分类与月预算（改名、改预算、换图标、新增、删除）、固定支出（每月几号自动记一笔）。
 * 编辑在草稿里进行，保存才写入（保存条、⌘S 与离开确认由 Tau 提供）；删除分类时它的流水移到「其他」。
 * 预算留空 = 不设；可以一键按前 3 个月的平均填入。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSettingsDraft, type PluginSettingsProps } from "@tau/plugins";
import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton, Input, Loading, Popover, Select, cn, toast } from "@tau/ui";
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
} from "../data/model";
import { baseline } from "../data/stats";
import { configChanges } from "../data/changes";
import { EXPENSE_KEY, useRuntime } from "../runtime";
import { CategoryIcon, ICONS, yuan } from "./bits";
import { useConfig, useLedger, useNow } from "./queries";

interface CatDraft extends Omit<Category, "budget"> {
  budget: string;
}
interface RecDraft extends Omit<Recurring, "cents" | "day"> {
  cents: string;
  day: string;
}

/** 新分类排在「其他」前面，「其他」始终在最后 */
function insertBeforeOther(list: CatDraft[], item: CatDraft): CatDraft[] {
  const k = list.findIndex(c => c.id === OTHER);
  return k < 0 ? [...list, item] : [...list.slice(0, k), item, ...list.slice(k)];
}

const toYuanText = (cents: number) => (cents ? formatYuan(cents).replace(/,/g, "") : "");
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function SettingsForm(_: PluginSettingsProps) {
  const { data, context } = useRuntime();
  const client = useQueryClient();
  const config = useConfig();
  const { today } = useNow();
  const ledger = useLedger(monthOf(today), today);
  const [cats, setCats] = useState<CatDraft[] | null>(null);
  const [recs, setRecs] = useState<RecDraft[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const reset = (c: Config) => {
    setCats(c.categories.map(x => ({ ...x, budget: toYuanText(x.budget) })));
    setRecs(c.recurring.map(r => ({ ...r, cents: toYuanText(r.cents), day: String(r.day) })));
    setRemoved([]);
  };
  useEffect(() => {
    if (config.isSuccess && cats == null) reset(config.data);
  }, [config.isSuccess, config.data, cats]);

  // 预算填 0 和留空一样表示不设
  const budgetOf = (text: string) => (/^0*(\.0*)?$/.test(text.trim()) ? 0 : parseYuan(text));
  const list = cats ?? [];
  const catErrors = list.map(c => (!c.name.trim() ? "填名称" : budgetOf(c.budget) == null ? "金额不对" : null));
  const recErrors = recs.map(r =>
    !r.note.trim() ? "填名称" : parseYuan(r.cents) == null ? "金额不对" : !(Number(r.day) >= 1 && Number(r.day) <= 28 && Number.isInteger(Number(r.day))) ? "填 1–28" : null
  );
  const errorCount = [...catErrors, ...recErrors].filter(e => e != null).length;
  const valid = errorCount === 0;
  // 草稿按已保存的格式折算后再比；金额填写有误的项先按 0 比，错误另由 errors 拦住保存
  const toConfig = (): Config => ({
    categories: list.map(c => ({ id: c.id, name: c.name.trim(), icon: c.icon, color: c.color, budget: budgetOf(c.budget) ?? 0 })),
    recurring: recs.map(r => ({ id: r.id, note: r.note.trim(), cents: parseYuan(r.cents) ?? 0, category: r.category, day: Number(r.day) || 0 })),
  });
  const changes = cats && config.data ? configChanges(config.data, toConfig()) : [];

  const save = async () => {
    const next = toConfig();
    let moved = 0;
    for (const id of removed) moved += await data.moveCategory(id, OTHER);
    await data.saveConfig(next);
    if (context.signal.aborted) return;
    await client.invalidateQueries({ queryKey: EXPENSE_KEY });
    reset(next);
    return moved ? `已保存，${moved} 笔流水移到了「其他」` : undefined;
  };
  const draft = useSettingsDraft({
    dirty: changes.length > 0 || removed.length > 0,
    errors: errorCount,
    changes,
    save,
    reset: () => config.data && reset(config.data),
  });

  if (!cats) return <Loading minHeight={120} />;

  const total = cats.reduce((s, c) => s + (budgetOf(c.budget) ?? 0), 0);
  const base = ledger.data ? baseline(ledger.data.history, monthOf(today)) : [];
  const setCat = (i: number, patch: Partial<CatDraft>) => setCats(cats.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const setRec = (i: number, patch: Partial<RecDraft>) => setRecs(recs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const fillFromHistory = () => {
    if (!base.length) return;
    setCats(
      cats.map(c => {
        const avg = base.reduce((s, m) => s + (m.byCategory[c.id] ?? 0), 0) / base.length;
        // 取整到 50 元，看起来像人定的预算
        return avg > 0 ? { ...c, budget: String(Math.ceil(avg / 5000) * 50) } : c;
      })
    );
  };

  // 不在 Tau 设置页里（没有宿主保存条）时用自带按钮
  const saveHere = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const text = await save();
      toast.success(text ?? "已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const catOptions = cats.map(c => ({ value: c.id, label: c.name || "未命名" }));

  return (
    <div className="ex:flex ex:flex-col ex:gap-5 ex:px-3 ex:py-2">
      <section className="ex:flex ex:flex-col ex:gap-1.5">
        <div className="ex:flex ex:items-center ex:gap-2">
          <h3 className="ex:text-[13px] ex:font-semibold">分类与月预算</h3>
          <span className="ex:text-ink-3 ex:text-[12px]">合计 {yuan(total)} / 月 · 留空表示不设</span>
          <span className="ex:flex-1" />
          {base.length > 0 && (
            <Button size="sm" variant="ghost" onClick={fillFromHistory}>
              按前 {base.length} 个月平均填入
            </Button>
          )}
        </div>
        {cats.map((c, i) => (
          <div key={c.id} className="ex:grid ex:grid-cols-[28px_minmax(0,1fr)_120px_28px] ex:items-start ex:gap-2">
            <IconPicker category={c} onPick={icon => setCat(i, { icon })} />
            <Input size="sm" value={c.name} maxLength={12} onChange={e => setCat(i, { name: e.target.value })} aria-label="分类名称" aria-invalid={!c.name.trim()} />
            <div className="ex:flex ex:flex-col ex:gap-0.5">
              <Input
                size="sm"
                inputMode="decimal"
                value={c.budget}
                placeholder="不设"
                onChange={e => setCat(i, { budget: e.target.value.replace(/[^\d.]/g, "") })}
                aria-label={`${c.name}的月预算（元）`}
                aria-invalid={catErrors[i] === "金额不对"}
                className="ex:text-right ex:tabular-nums"
              />
              {catErrors[i] && <span className="ex:text-danger ex:text-[11px]">{catErrors[i]}</span>}
            </div>
            {c.id === OTHER ? (
              <span />
            ) : (
              <IconButton
                aria-label={`删除 ${c.name}`}
                onClick={() => {
                  setCats(cats.filter((_, k) => k !== i));
                  setRecs(recs.map(r => (r.category === c.id ? { ...r, category: OTHER } : r)));
                  if (config.data?.categories.some(x => x.id === c.id)) setRemoved([...removed, c.id]);
                }}
              >
                <Trash2 className="ex:size-[14px]" strokeWidth={1.75} />
              </IconButton>
            )}
          </div>
        ))}
        {cats.length < MAX_CATEGORIES && (
          <Button
            size="sm"
            variant="ghost"
            icon={Plus}
            className="ex:self-start"
            onClick={() => setCats(insertBeforeOther(cats, { id: newId("c"), name: "", icon: "tag", budget: "", color: nextColor(cats) }))}
          >
            新增分类
          </Button>
        )}
        {removed.length > 0 && <p className="ex:text-ink-3 ex:text-[12px]">删除的分类里的流水，保存后会移到「其他」。</p>}
      </section>

      <section className="ex:flex ex:flex-col ex:gap-1.5">
        <div className="ex:flex ex:items-center ex:gap-2">
          <h3 className="ex:text-[13px] ex:font-semibold">固定支出</h3>
          <span className="ex:text-ink-3 ex:text-[12px]">房租、话费、会员这类每月不变的，到日子自动记一笔，不计入日历和日均</span>
        </div>
        {recs.map((r, i) => (
          <div key={r.id} className="ex:grid ex:grid-cols-[minmax(0,1fr)_120px_100px_92px_28px] ex:items-start ex:gap-2">
            <Input size="sm" value={r.note} maxLength={40} placeholder="房租" onChange={e => setRec(i, { note: e.target.value })} aria-label="名称" aria-invalid={recErrors[i] === "填名称"} />
            <Select size="sm" aria-label="分类" value={r.category} onValueChange={v => setRec(i, { category: v })} options={catOptions} />
            <Input
              size="sm"
              inputMode="decimal"
              value={r.cents}
              placeholder="金额"
              onChange={e => setRec(i, { cents: e.target.value.replace(/[^\d.]/g, "") })}
              aria-label="金额（元）"
              aria-invalid={recErrors[i] === "金额不对"}
              className="ex:text-right ex:tabular-nums"
            />
            <div className="ex:flex ex:items-center ex:gap-1">
              <span className="ex:text-ink-3 ex:text-[12px]">每月</span>
              <Input size="sm" inputMode="numeric" value={r.day} onChange={e => setRec(i, { day: e.target.value.replace(/[^\d]/g, "").slice(0, 2) })} aria-label="每月几号" aria-invalid={recErrors[i] === "填 1–28"} className="ex:text-right ex:tabular-nums" wrapperClassName="ex:w-11" />
              <span className="ex:text-ink-3 ex:text-[12px]">号</span>
            </div>
            <IconButton aria-label={`删除 ${r.note || "这条固定支出"}`} onClick={() => setRecs(recs.filter((_, k) => k !== i))}>
              <Trash2 className="ex:size-[14px]" strokeWidth={1.75} />
            </IconButton>
            {recErrors[i] && <span className="ex:text-danger ex:col-span-5 ex:text-[11px]">{recErrors[i]}</span>}
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          icon={Plus}
          className="ex:self-start"
          onClick={() => setRecs([...recs, { id: newId("r"), note: "", cents: "", category: cats.find(c => c.id === "home")?.id ?? OTHER, day: "1" }])}
        >
          新增固定支出
        </Button>
        <p className="ex:text-ink-3 ex:text-[12px]">新加的固定支出从本月开始记，不会补记以前的月份；删掉后已记的流水保留。</p>
      </section>

      {!draft && (
        <div className="ex:flex ex:justify-end ex:gap-2">
          <Button variant="secondary" disabled={saving} onClick={() => config.data && reset(config.data)}>
            还原
          </Button>
          <Button disabled={!valid} loading={saving} onClick={() => void saveHere()}>
            保存
          </Button>
        </div>
      )}
    </div>
  );
}


function IconPicker({ category, onPick }: { category: Pick<Category, "icon" | "color" | "name">; onPick(icon: string): void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" aria-label={`${category.name || "分类"}的图标`} className="ex:hover:bg-hover ex:grid ex:size-7 ex:place-items-center ex:rounded-[8px]">
          <CategoryIcon category={category} />
        </button>
      }
    >
      <div className="ex:grid ex:grid-cols-6 ex:gap-1 ex:p-2">
        {Object.entries(ICONS).map(([name, Glyph]) => (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={name === category.icon}
            onClick={() => {
              onPick(name);
              setOpen(false);
            }}
            className={cn(
              "ex:grid ex:size-8 ex:place-items-center ex:rounded-[8px]",
              name === category.icon ? "ex:bg-selected ex:text-accent-text" : "ex:text-ink-2 ex:hover:bg-hover"
            )}
          >
            <Glyph className="ex:size-4" strokeWidth={1.75} />
          </button>
        ))}
      </div>
    </Popover>
  );
}
