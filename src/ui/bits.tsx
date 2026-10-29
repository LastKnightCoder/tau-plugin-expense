/**
 * 页面共用的小部件与格式化：金额、分类图标与颜色、卡片外壳、宽度监听。
 * 金额一律等宽数字；超支 / 比平时多用 danger，省下来用 ok，并始终带正负号。
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bus,
  CircleEllipsis,
  Film,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  PawPrint,
  Plane,
  ShoppingBag,
  Smartphone,
  Tag,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@tau/ui";
import { formatYuan, type Category } from "../data/model";

const PALETTE_SIZE = 7;
export const categoryColor = (color: number) => `var(--ex-c${((color % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE})`;

/** 分类可选的图标；不认识的名字用通用标签图标 */
export const ICONS: Record<string, LucideIcon> = {
  food: UtensilsCrossed,
  shop: ShoppingBag,
  trans: Bus,
  fun: Film,
  home: House,
  social: Gift,
  other: CircleEllipsis,
  travel: Plane,
  digital: Smartphone,
  health: HeartPulse,
  study: GraduationCap,
  pet: PawPrint,
};
export const iconOf = (name: string): LucideIcon => ICONS[name] ?? Tag;

export function CategoryIcon({ category, size = "md" }: { category: Pick<Category, "icon" | "color">; size?: "sm" | "md" }) {
  const Glyph = iconOf(category.icon);
  const color = categoryColor(category.color);
  return (
    <span
      aria-hidden
      className={cn(
        "ex:grid ex:shrink-0 ex:place-items-center ex:rounded-full",
        size === "sm" ? "ex:size-[18px]" : "ex:size-6"
      )}
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      <Glyph className={size === "sm" ? "ex:size-2.5" : "ex:size-[13px]"} strokeWidth={size === "sm" ? 2.3 : 2} />
    </span>
  );
}

export const yuan = (cents: number) => `¥${formatYuan(Math.round(cents))}`;

/** 与基准的差：多花为 +（danger），少花为 −（ok），差额小于 flat 视为持平 */
export function Diff({ value, flat = 3000, className }: { value: number | null; flat?: number; className?: string }) {
  if (value == null) return <span className={cn("ex:text-ink-3", className)}>—</span>;
  if (Math.abs(value) < flat) return <span className={cn("ex:text-ink-3", className)}>持平</span>;
  return (
    <span className={cn("ex:font-semibold ex:tabular-nums", value > 0 ? "ex:text-danger" : "ex:text-ok", className)}>
      {value > 0 ? "+" : "−"}
      {formatYuan(Math.abs(Math.round(value)))}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("ex:bg-surface ex:shadow-card ex:rounded-tau-lg ex:min-w-0", className)}>{children}</section>;
}

export function CardHead({ title, note, children }: { title: ReactNode; note?: ReactNode; children?: ReactNode }) {
  return (
    <header className="ex:flex ex:min-h-11 ex:items-center ex:gap-2 ex:px-[18px] ex:pt-4">
      <h2 className="ex:text-[13.5px] ex:font-semibold">{title}</h2>
      {note && <span className="ex:text-ink-3 ex:text-[11.5px]">{note}</span>}
      <span className="ex:flex-1" />
      {children}
    </header>
  );
}

/** 进度条：竖线标出时间进度（可选），超出时描红边 */
export function Meter({ ratio, pace, color, className }: { ratio: number; pace?: number | null; color: string; className?: string }) {
  return (
    <div
      className={cn("ex:bg-track ex:relative ex:h-2 ex:overflow-hidden ex:rounded-full", className)}
      style={ratio > 1 ? { boxShadow: "0 0 0 1.5px var(--tau-danger)" } : undefined}
    >
      <i className="ex:absolute ex:inset-y-0 ex:left-0 ex:rounded-full" style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} />
      {pace != null && <i className="ex:bg-ink-1 ex:absolute ex:-inset-y-px ex:w-0.5 ex:rounded-[1px] ex:opacity-55" style={{ left: `${pace * 100}%` }} />}
    </div>
  );
}

/** 元素的内容宽度，随容器缩放更新（图表按像素绘制） */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const WEEK = "日一二三四五六";
export function dayLabel(date: string, today?: string): string {
  if (today && date === today) return "今天";
  const [y, m, d] = date.split("-").map(Number);
  return `${m}月${d}日 周${WEEK[new Date(y, m - 1, d).getDay()]}`;
}
export const monthLabel = (month: string) => `${Number(month.slice(5, 7))} 月`;
export const WEEKDAYS = "一二三四五六日";
