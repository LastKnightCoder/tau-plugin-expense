import { describe, expect, it } from "vitest";
import manifest from "../../manifest.json";

describe("manifest", () => {
  it("声明了 AI 归类与分析用到的对话能力", () => {
    expect(manifest.permissions).toContain("ai:chat");
  });

  it("除 AI 外只申请语音输入，不申请用户数据权限", () => {
    expect(manifest.permissions.filter(p => !p.startsWith("ai:"))).toEqual(["speech:input"]);
  });

  it("三端都声明，手机最低版本覆盖首页卡片与语音输入", () => {
    expect(Object.keys(manifest.targets).sort()).toEqual(["android", "desktop", "ios"]);
    expect(manifest.targets.android.minAppVersion).toBe("0.2.16");
    expect(manifest.targets.ios.minAppVersion).toBe("0.2.16");
  });
});
