/**
 * 手机界面共用的写入动作：记几笔（手动选过分类的记住备注）、删除并给撤销。
 */
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "@tau/ui";
import type { Tx, TxInput } from "../../data/model";
import { EXPENSE_KEY, type ExpenseRuntime } from "../../runtime";

export interface NewTx extends Omit<TxInput, "recurringId"> {
  /** 分类是用户点选或 AI 归的：记住这句备注，下次自动归类 */
  remember?: boolean;
}

/** 中途写入失败时抛出，saved 为已经记下的几笔（调用方据此去掉，避免重试时重复记） */
export class PartialAddError extends Error {
  constructor(readonly saved: number) {
    super(`已记下 ${saved} 笔，其余记录失败`);
  }
}

export async function addTxs(runtime: Pick<ExpenseRuntime, "data">, client: QueryClient, inputs: readonly NewTx[]): Promise<Tx[]> {
  const saved: Tx[] = [];
  try {
    for (const { remember, ...input } of inputs) {
      try {
        saved.push(await runtime.data.addTx({ ...input, recurringId: null }));
      } catch (error) {
        throw saved.length ? new PartialAddError(saved.length) : error;
      }
      // 记不住不影响这笔已经记下
      if (remember && input.note) await runtime.data.rememberAlias(input.note, input.category).catch(() => undefined);
    }
    return saved;
  } finally {
    // 失败时已记下的几笔也要显示出来
    await client.invalidateQueries({ queryKey: EXPENSE_KEY });
  }
}

export async function removeWithUndo(runtime: Pick<ExpenseRuntime, "data">, client: QueryClient, tx: Tx) {
  try {
    await runtime.data.deleteTx(tx);
    await client.invalidateQueries({ queryKey: EXPENSE_KEY });
    const { id: _id, revision: _revision, ...input } = tx;
    toast.success(`已删除「${tx.note || "这一笔"}」`, {
      action: {
        label: "撤销",
        onClick: () =>
          void runtime.data
            .addTx(input)
            .then(() => client.invalidateQueries({ queryKey: EXPENSE_KEY }))
            .catch(() => toast.error("撤销失败")),
      },
    });
  } catch {
    toast.error("删除失败");
  }
}
