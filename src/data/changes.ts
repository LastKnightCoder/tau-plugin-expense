import type { Config } from "./model";
import { formatYuan } from "./model";
import type { Translate } from "../i18n";

export interface ConfigChange {
  label: string;
  from?: string;
  to?: string;
}

const money = (cents: number, t: Translate) => (cents ? `¥${formatYuan(cents)}` : t("changes.noBudget"));

/** 草稿与已保存配置的差异，按分类、固定支出逐项列出，供保存条与离开确认；label 在调用时按当前语言解析 */
export function configChanges(saved: Config, draft: Config, t: Translate): ConfigChange[] {
  const changes: ConfigChange[] = [];
  const before = new Map(saved.categories.map(c => [c.id, c]));
  const after = new Map(draft.categories.map(c => [c.id, c]));
  for (const c of draft.categories) {
    const old = before.get(c.id);
    const name = c.name.trim() || t("changes.unnamedCat");
    if (!old) changes.push({ label: t("changes.catAdded", { name }) });
    else {
      if (old.name !== c.name) changes.push({ label: t("changes.catName"), from: old.name, to: c.name });
      if (old.budget !== c.budget) changes.push({ label: t("changes.catBudget", { name }), from: money(old.budget, t), to: money(c.budget, t) });
      if (old.icon !== c.icon) changes.push({ label: t("changes.catIcon", { name }) });
    }
  }
  for (const c of saved.categories) if (!after.has(c.id)) changes.push({ label: t("changes.catRemoved", { name: c.name }) });
  const recBefore = new Map(saved.recurring.map(r => [r.id, r]));
  const recAfter = new Set(draft.recurring.map(r => r.id));
  for (const r of draft.recurring) {
    const old = recBefore.get(r.id);
    const name = r.note.trim() || t("changes.unnamedRec");
    if (!old) changes.push({ label: t("changes.recAdded", { name }) });
    else if (old.note !== r.note || old.cents !== r.cents || old.category !== r.category || old.day !== r.day)
      changes.push({ label: t("changes.recChanged", { name }) });
  }
  for (const r of saved.recurring) if (!recAfter.has(r.id)) changes.push({ label: t("changes.recRemoved", { name: r.note }) });
  if (changes.length === 0 && saved.categories.map(c => c.id).join() !== draft.categories.map(c => c.id).join())
    changes.push({ label: t("changes.catOrder") });
  return changes;
}
