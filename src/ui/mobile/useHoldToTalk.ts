/**
 * 按住说话：按住 250ms 开始录音，上滑超过 60px 松手取消，松手结束并交出识别文字；更短的轻点给提示。
 * 识别经 context.speech（沿用应用的语音输入设置），不可用时轻点或按住都提示原因。
 */
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useI18n, type PluginSpeechSession } from "@tau/plugins";
import { useRuntime } from "../../runtime";
import { messages } from "../../i18n";

const HOLD_MS = 250;
const CANCEL_PX = 60;

export interface HoldToTalk {
  active: boolean;
  connecting: boolean;
  preview: string;
  cancelArmed: boolean;
  unavailable: string | null;
  bind: {
    onPointerDown(e: PointerEvent<HTMLElement>): void;
    onPointerMove(e: PointerEvent<HTMLElement>): void;
    onPointerUp(e: PointerEvent<HTMLElement>): void;
    onPointerCancel(e: PointerEvent<HTMLElement>): void;
    onContextMenu(e: { preventDefault(): void }): void;
  };
}

export function useHoldToTalk({ onText, onError }: { onText(text: string): void; onError(message: string): void }): HoldToTalk {
  const { context } = useRuntime();
  const { t } = useI18n(messages);
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [preview, setPreview] = useState("");
  const [cancelArmed, setCancelArmed] = useState(false);
  const state = useRef<{
    timer?: number;
    startY: number;
    pointer: number;
    session?: Promise<PluginSpeechSession | null>;
    controller?: AbortController;
    cancel: boolean;
  } | null>(null);
  const latest = useRef({ onText, onError });
  latest.current = { onText, onError };
  const unavailable = context.speech.unavailableReason();

  useEffect(() => () => state.current?.controller?.abort(), []);

  const reset = () => {
    setActive(false);
    setConnecting(false);
    setPreview("");
    setCancelArmed(false);
    state.current = null;
  };

  const begin = () => {
    const current = state.current;
    if (!current) return;
    const reason = context.speech.unavailableReason();
    if (reason) {
      latest.current.onError(reason);
      return reset();
    }
    const controller = new AbortController();
    current.controller = controller;
    setActive(true);
    setConnecting(true);
    navigator.vibrate?.(10);
    current.session = context.speech
      .start({ signal: controller.signal, onPreview: setPreview })
      .then(session => {
        setConnecting(false);
        return session;
      })
      .catch(error => {
        if (!controller.signal.aborted) latest.current.onError(speechErrorText(t, error));
        reset();
        return null;
      });
  };

  const finish = async (cancel: boolean) => {
    const current = state.current;
    if (!current) return;
    window.clearTimeout(current.timer);
    if (!current.session) {
      reset();
      if (!cancel) latest.current.onError(unavailable ?? t("hold.defaultHint"));
      return;
    }
    const session = await current.session;
    if (!session) return;
    if (cancel) {
      await session.cancel().catch(() => undefined);
      return reset();
    }
    try {
      await session.stop();
      const text = (await session.result).trim();
      reset();
      if (text) latest.current.onText(text);
      else latest.current.onError(t("hold.notClear"));
    } catch (error) {
      reset();
      if (!current.controller?.signal.aborted) latest.current.onError(speechErrorText(t, error));
    }
  };

  return {
    active,
    connecting,
    preview,
    cancelArmed,
    unavailable,
    bind: {
      onPointerDown(e) {
        if (state.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        state.current = { startY: e.clientY, pointer: e.pointerId, cancel: false };
        state.current.timer = window.setTimeout(begin, HOLD_MS);
      },
      onPointerMove(e) {
        const current = state.current;
        if (!current || current.pointer !== e.pointerId) return;
        const armed = current.startY - e.clientY > CANCEL_PX;
        current.cancel = armed;
        setCancelArmed(armed);
      },
      onPointerUp(e) {
        if (state.current?.pointer !== e.pointerId) return;
        void finish(state.current.cancel);
      },
      onPointerCancel() {
        void finish(true);
      },
      onContextMenu(e) {
        e.preventDefault();
      },
    },
  };
}

/** 宿主的原始诊断保持透传；能识别的失败按词典 key 翻译 */
function speechErrorText(t: (key: "hold.authFailed" | "hold.failed") => string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/^SPEECH_UNAVAILABLE[：:]/.test(message)) return message.replace(/^SPEECH_UNAVAILABLE[：:]\s*/, "");
  if (/未授权|未声明/.test(message)) return t("hold.authFailed");
  return t("hold.failed");
}
