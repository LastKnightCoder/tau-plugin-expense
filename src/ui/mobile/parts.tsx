/**
 * 手机界面的小部件：卡片、主按钮、分类图标、金额键盘、文字页签、预算进度条。
 * 触控目标不小于 32px；颜色只用主题 token 与分类数据色。
 */
import type { ReactNode } from "react";
import { Delete } from "lucide-react";
import { cn } from "@tau/ui";
import type { Category } from "../../data/model";
import { categoryColor, iconOf } from "../bits";

export function MCard({ className, children, onClick }: { className?: string; children: ReactNode; onClick?(): void }) {
  const Tag = onClick ? "button" : "section";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "ex:bg-surface ex:shadow-card ex:block ex:w-full ex:min-w-0 ex:rounded-[18px] ex:px-4 ex:py-3.5 ex:text-left",
        onClick && "ex:active:scale-[0.99] ex:transition-transform",
        className
      )}
    >
      {children}
    </Tag>
  );
}

export function CardTitle({ title, note, children }: { title: ReactNode; note?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ex:mb-1 ex:flex ex:min-h-7 ex:items-center ex:gap-1.5">
      <h2 className="ex:text-[13.5px] ex:font-[650]">{title}</h2>
      {note && <small className="ex:text-ink-3 ex:truncate ex:text-[11.5px]">{note}</small>}
      <span className="ex:flex-1" />
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  ghost,
  small,
  className,
}: {
  children: ReactNode;
  onClick?(): void;
  disabled?: boolean;
  ghost?: boolean;
  small?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "ex:flex ex:items-center ex:justify-center ex:gap-1.5 ex:font-[650] ex:transition-[transform,opacity] ex:active:scale-[0.98] ex:disabled:opacity-40 ex:[&>svg]:size-4",
        small ? "ex:h-9 ex:rounded-[12px] ex:px-3.5 ex:text-[13.5px]" : "ex:h-[50px] ex:w-full ex:rounded-[16px] ex:text-[15.5px]",
        ghost ? "ex:bg-hover ex:text-ink-1" : "ex:bg-accent ex:text-ink-inverse",
        className
      )}
    >
      {children}
    </button>
  );
}

/** 圆角方块分类图标；ghost 用于还没选分类 */
export function CatIcon({ category, size = 30, ghost }: { category: Pick<Category, "icon" | "color"> | null; size?: number; ghost?: boolean }) {
  const Glyph = iconOf(category?.icon ?? "tag");
  const color = category ? categoryColor(category.color) : "var(--tau-ink-3)";
  return (
    <span
      aria-hidden
      className="ex:grid ex:shrink-0 ex:place-items-center ex:rounded-[10px]"
      style={{
        width: size,
        height: size,
        borderRadius: size >= 30 ? 10 : 99,
        ...(ghost || !category
          ? { boxShadow: "inset 0 0 0 1.5px var(--tau-line-1)", color }
          : { background: `color-mix(in srgb, ${color} 15%, transparent)`, color }),
      }}
    >
      <Glyph style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5) }} strokeWidth={2} />
    </span>
  );
}

/** 预算进度条：竖线是时间进度（可选），超了描红边；adding 为这一笔记下后多出的部分 */
export function Bar({
  ratio,
  pace,
  danger,
  adding = 0,
  className,
}: {
  ratio: number;
  pace?: number | null;
  danger?: boolean;
  adding?: number;
  className?: string;
}) {
  const used = Math.min(1, ratio);
  const extra = Math.min(1 - used, adding);
  const color = danger ? "var(--tau-danger)" : "var(--tau-accent)";
  return (
    <span
      aria-hidden
      className={cn("ex:bg-track ex:relative ex:block ex:h-2 ex:rounded-full", className)}
      style={ratio + adding > 1 ? { boxShadow: "0 0 0 1.5px var(--tau-danger)" } : undefined}
    >
      <i className="ex:absolute ex:inset-y-0 ex:left-0 ex:rounded-full" style={{ width: `${used * 100}%`, background: color }} />
      {extra > 0 && (
        <i
          className="ex:absolute ex:inset-y-0 ex:rounded-r-full"
          style={{ left: `${used * 100}%`, width: `${extra * 100}%`, background: `color-mix(in srgb, ${color} 40%, transparent)` }}
        />
      )}
      {pace != null && (
        <i className="ex:bg-ink-1 ex:absolute ex:-inset-y-0.5 ex:w-0.5 ex:-translate-x-1/2 ex:rounded-[1px] ex:opacity-55" style={{ left: `${pace * 100}%` }} />
      )}
    </span>
  );
}

/** 文字页签（不用 Segmented）：选中项加粗并带下划线 */
export function TextTabs<T extends string>({ value, onChange, options }: { value: T; onChange(value: T): void; options: [T, string][] }) {
  return (
    <div className="ex:border-line-2 ex:mb-2.5 ex:flex ex:gap-5 ex:border-b" role="tablist">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={key === value}
          onClick={() => onChange(key)}
          className={cn(
            "ex:relative ex:h-8 ex:text-[14.5px]",
            key === value
              ? "ex:text-ink-1 ex:font-[650] ex:after:bg-accent ex:after:absolute ex:after:inset-x-[20%] ex:after:-bottom-px ex:after:h-[2.5px] ex:after:rounded-full ex:after:content-['']"
              : "ex:text-ink-3"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** 面板数字键盘：金额最多两位小数、整数 9 位 */
export function AmountPad({ value, onChange }: { value: string; onChange(value: string): void }) {
  const press = (key: string) => {
    if (key === "del") return onChange(value.slice(0, -1));
    if (key === ".") return value.includes(".") ? undefined : onChange(value ? `${value}.` : "0.");
    const [int, decimals] = value.split(".");
    if (decimals != null && decimals.length >= 2) return;
    if (decimals == null && int.length >= 9) return;
    onChange(value === "0" ? key : value + key);
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];
  return (
    <div className="ex:mb-2.5 ex:grid ex:grid-cols-3 ex:gap-1.5">
      {keys.map(key => (
        <button
          key={key}
          type="button"
          aria-label={key === "del" ? "删除" : key}
          onClick={() => press(key)}
          className={cn(
            "ex:grid ex:h-[46px] ex:place-items-center ex:rounded-[12px] ex:text-[20px] ex:font-medium ex:active:bg-press",
            key === "." || key === "del" ? "ex:text-ink-2" : "ex:bg-hover"
          )}
        >
          {key === "del" ? <Delete className="ex:size-5" /> : key}
        </button>
      ))}
    </div>
  );
}

/** 大号金额：AmountPad 的显示区 */
export function AmountDisplay({ value, placeholder, caret }: { value: string; placeholder?: string; caret?: boolean }) {
  return (
    <div className="ex:my-2 ex:text-center ex:text-[40px] ex:leading-[1.15] ex:font-[750] ex:tracking-[-0.03em] ex:tabular-nums">
      <small className="ex:text-ink-3 ex:mr-0.5 ex:text-[20px] ex:font-semibold">¥</small>
      {value ? value : <span className="ex:text-ink-3">{placeholder ?? "0"}</span>}
      {caret && <span aria-hidden className="ex:bg-accent ex:ml-0.5 ex:inline-block ex:h-[34px] ex:w-0.5 ex:animate-pulse ex:align-[-4px]" />}
    </div>
  );
}

/** 分类宫格：编辑面板与语音整理里选分类 */
export function CategoryGrid({ categories, value, onChange }: { categories: readonly Category[]; value: string; onChange(id: string): void }) {
  return (
    <div className="ex:my-3 ex:grid ex:grid-cols-4 ex:gap-1.5" role="radiogroup" aria-label="分类">
      {categories.map(c => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={c.id === value}
          onClick={() => onChange(c.id)}
          className={cn(
            "ex:flex ex:flex-col ex:items-center ex:gap-1 ex:rounded-[12px] ex:pt-[7px] ex:pb-1.5 ex:text-[11.5px]",
            c.id === value ? "ex:bg-hover ex:text-ink-1 ex:font-[650] ex:shadow-[inset_0_0_0_1.5px_var(--tau-ink-1)]" : "ex:text-ink-2"
          )}
        >
          <CatIcon category={c} size={32} />
          <span className="ex:max-w-full ex:truncate ex:px-1">{c.name}</span>
        </button>
      ))}
    </div>
  );
}
