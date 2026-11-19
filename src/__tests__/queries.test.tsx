// @vitest-environment jsdom
import { Activity, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNow } from "../ui/queries";

vi.mock("../runtime", () => ({ EXPENSE_KEY: ["expense"], useRuntime: vi.fn() }));

function Clock() {
  const { today, time } = useNow();
  return (
    <output>
      {today} {time}
    </output>
  );
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 31, 17, 5));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("页面时钟", () => {
  it("保活页面恢复时立即更新日期和时间", async () => {
    await act(async () => {
      root.render(
        <Activity mode="visible">
          <Clock />
        </Activity>
      );
    });
    expect(container.textContent).toBe("2026-10-31 17:05");
    await act(async () => {
      root.render(
        <Activity mode="hidden">
          <Clock />
        </Activity>
      );
    });
    vi.setSystemTime(new Date(2026, 10, 1, 0, 1));
    await act(async () => {
      root.render(
        <Activity mode="visible">
          <Clock />
        </Activity>
      );
    });
    expect(container.textContent).toBe("2026-11-01 00:01");
  });

  it.each(["focus", "visibilitychange"])("%s 时立即校时", async event => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    await act(async () => {
      root.render(<Clock />);
    });
    vi.setSystemTime(new Date(2026, 9, 31, 20, 28));
    await act(async () => {
      (event === "focus" ? window : document).dispatchEvent(new Event(event));
    });
    expect(container.textContent).toBe("2026-10-31 20:28");
  });

  it("保持每分钟刷新，卸载时清理定时器与事件", async () => {
    await act(async () => {
      root.render(<Clock />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(container.textContent).toBe("2026-10-31 17:06");
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const documentRemove = vi.spyOn(document, "removeEventListener");
    await act(async () => {
      root.render(null);
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(windowRemove).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(documentRemove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
