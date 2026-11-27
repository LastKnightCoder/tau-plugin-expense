/**
 * 修改一笔：金额、分类、备注、日期。改了分类时记住这句备注对应的新分类。
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@tau/plugins";
import { Button, DatePicker, Dialog, DialogBody, FormField, Input, Select, toast } from "@tau/ui";
import { formatYuan, parseYuan, type Category, type Tx } from "../data/model";
import { EXPENSE_KEY, useRuntime } from "../runtime";
import { messages } from "../i18n";
import { CategoryIcon } from "./bits";

export function TxDialog({ tx, categories, onClose }: { tx: Tx | null; categories: readonly Category[]; onClose(): void }) {
  const { data, context } = useRuntime();
  const { t } = useI18n(messages);
  const client = useQueryClient();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!tx) return;
    setAmount(formatYuan(tx.cents).replace(/,/g, ""));
    setCategory(tx.category);
    setNote(tx.note);
    setDate(tx.date);
  }, [tx]);

  const cents = parseYuan(amount);
  const valid = cents != null && categories.some(c => c.id === category) && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const save = async () => {
    if (!tx || !valid || saving) return;
    setSaving(true);
    try {
      await data.updateTx(tx, { cents: cents!, category, note: note.trim().slice(0, 200), date });
      if (category !== tx.category && note.trim()) await data.rememberAlias(note, category).catch(() => undefined);
      if (context.signal.aborted) return;
      await client.invalidateQueries({ queryKey: EXPENSE_KEY });
      onClose();
    } catch {
      toast.error(t("txDialog.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={tx != null}
      onOpenChange={open => !open && onClose()}
      title={t("txDialog.title")}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!valid} loading={saving} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="ex:flex ex:flex-col ex:gap-3">
          <FormField label={t("txDialog.amount")}>
            {field => (
              <Input
                {...field}
                data-autofocus
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 12))}
                onKeyDown={e => e.key === "Enter" && !e.nativeEvent.isComposing && void save()}
                aria-invalid={amount !== "" && cents == null}
                className="ex:tabular-nums"
              />
            )}
          </FormField>
          <FormField label={t("common.category")}>
            {field => (
              <Select
                {...field}
                aria-label={t("common.category")}
                value={category}
                onValueChange={setCategory}
                options={categories.map(c => ({
                  value: c.id,
                  label: (
                    <span className="ex:inline-flex ex:items-center ex:gap-2">
                      <CategoryIcon category={c} size="sm" />
                      {c.name}
                    </span>
                  ),
                  searchText: c.name,
                }))}
              />
            )}
          </FormField>
          <FormField label={t("txDialog.note")}>
            {field => <Input {...field} value={note} onChange={e => setNote(e.target.value)} maxLength={200} />}
          </FormField>
          <FormField label={t("txDialog.date")}>
            {field => <DatePicker {...field} value={date} onValueChange={v => v && setDate(v)} />}
          </FormField>
        </div>
      </DialogBody>
    </Dialog>
  );
}
