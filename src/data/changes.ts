import type { Config } from "./model";
import { formatYuan } from "./model";

export interface ConfigChange {
  label: string;
  from?: string;
  to?: string;
}

const money = (cents: number) => (cents ? `¥${formatYuan(cents)}` : "不设");

/** 草稿与已保存配置的差异，按分类、固定支出逐项列出，供保存条与离开确认 */
export function configChanges(saved: Config, draft: Config): ConfigChange[] {
  const changes: ConfigChange[] = [];
  const before = new Map(saved.categories.map(c => [c.id, c]));
  const after = new Map(draft.categories.map(c => [c.id, c]));
  for (const c of draft.categories) {
    const old = before.get(c.id);
    const name = c.name.trim() || "未命名分类";
    if (!old) changes.push({ label: `新增分类「${name}」` });
    else {
      if (old.name !== c.name) changes.push({ label: "分类名称", from: old.name, to: c.name });
      if (old.budget !== c.budget) changes.push({ label: `${name}的月预算`, from: money(old.budget), to: money(c.budget) });
      if (old.icon !== c.icon) changes.push({ label: `${name}的图标` });
    }
  }
  for (const c of saved.categories) if (!after.has(c.id)) changes.push({ label: `删除分类「${c.name}」` });
  const recBefore = new Map(saved.recurring.map(r => [r.id, r]));
  const recAfter = new Set(draft.recurring.map(r => r.id));
  for (const r of draft.recurring) {
    const old = recBefore.get(r.id);
    const name = r.note.trim() || "未命名固定支出";
    if (!old) changes.push({ label: `新增固定支出「${name}」` });
    else if (old.note !== r.note || old.cents !== r.cents || old.category !== r.category || old.day !== r.day)
      changes.push({ label: `固定支出「${name}」` });
  }
  for (const r of saved.recurring) if (!recAfter.has(r.id)) changes.push({ label: `删除固定支出「${r.note}」` });
  if (changes.length === 0 && saved.categories.map(c => c.id).join() !== draft.categories.map(c => c.id).join())
    changes.push({ label: "分类顺序" });
  return changes;
}
