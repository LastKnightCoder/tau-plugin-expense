/**
 * 手机底部面板：贴底圆角卡 + 遮罩，系统返回与点遮罩关闭；内容在键盘之上（宿主页外壳随键盘收缩）。
 * 返回经 pageContext.registerDismiss 交给 Tau 仲裁（后开的面板先关）；不在插件页面里时只靠遮罩关闭。
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PluginPageContext } from "@tau/plugins";
import { cn, lockBodyScroll, usePortalContainer } from "@tau/ui";

/** 页面把 pageContext 放进来，面板据此登记返回；首页卡片里没有 pageContext */
export const SheetHost = createContext<Pick<PluginPageContext, "registerDismiss"> | null>(null);

const DURATION = 240;

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  trailing,
  children,
}: {
  open: boolean;
  onClose(): void;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** 标题行右侧（如「删除这次」「重说」） */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const container = usePortalContainer();
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), DURATION);
    return () => window.clearTimeout(timer);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll(container.ownerDocument);
  }, [open, container]);
  const host = useContext(SheetHost);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open || !host) return;
    const handle = host.registerDismiss(() => close.current());
    return () => void handle.dispose();
  }, [open, host]);
  if (!mounted) return null;
  return createPortal(
    <div className="ex:fixed ex:inset-0 ex:z-[60]" data-no-edge-back onClick={event => event.stopPropagation()}>
        <div
          aria-hidden
          onClick={onClose}
          className={cn(
            "ex:bg-overlay ex:absolute ex:inset-0 ex:transition-opacity ex:duration-200",
            shown ? "ex:opacity-100" : "ex:opacity-0"
          )}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === "string" ? title : undefined}
          className={cn(
            "ex:bg-surface ex:shadow-float ex:absolute ex:inset-x-0 ex:bottom-0 ex:flex ex:max-h-[88%] ex:flex-col ex:rounded-t-[26px] ex:px-[18px] ex:pt-2",
            "ex:pb-[max(12px,env(safe-area-inset-bottom))] ex:ease-tau-out ex:transition-transform ex:duration-[240ms]",
            shown ? "ex:translate-y-0" : "ex:translate-y-full"
          )}
        >
          <div aria-hidden className="ex:bg-line-1 ex:mx-auto ex:mb-3 ex:h-1 ex:w-9 ex:shrink-0 ex:rounded-full" />
          {(title || trailing) && (
            <div className="ex:mb-1 ex:flex ex:shrink-0 ex:items-center ex:gap-2">
              <h2 className="ex:text-[16px] ex:font-[650]">{title}</h2>
              {subtitle && <span className="ex:text-ink-3 ex:text-[12px]">{subtitle}</span>}
              <span className="ex:flex-1" />
              {trailing}
            </div>
          )}
          <div className="ex:min-h-0 ex:overflow-y-auto ex:overscroll-contain">{children}</div>
        </div>
    </div>,
    container
  );
}
