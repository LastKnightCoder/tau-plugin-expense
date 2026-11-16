import { describe, expect, it } from "vitest";
import manifest from "../../manifest.json";

describe("manifest", () => {
  it("声明了 AI 归类与分析用到的对话能力", () => {
    expect(manifest.permissions).toContain("ai:chat");
  });

  it("除 AI 外只申请语音输入，不申请用户数据权限", () => {
    expect(manifest.permissions.filter(p => !p.startsWith("ai:"))).toEqual(["speech:input"]);
  });

  it("三端都声明，手机两端 minAppVersion 一致且格式合法", () => {
    expect(Object.keys(manifest.targets).sort()).toEqual(["android", "desktop", "ios"]);
    const semverLike = /^\d+\.\d+\.\d+$/;
    expect(manifest.targets.android.minAppVersion).toMatch(semverLike);
    expect(manifest.targets.ios.minAppVersion).toMatch(semverLike);
    expect(manifest.targets.android.minAppVersion).toBe(manifest.targets.ios.minAppVersion);
  });
});
