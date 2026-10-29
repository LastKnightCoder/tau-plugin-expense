import { describe, expect, it } from "vitest";
import manifest from "../../manifest.json";

describe("manifest", () => {
  it("声明了 AI 估算与分析用到的对话能力", () => {
    expect(manifest.permissions).toContain("ai:chat");
  });

  it("只用到插件记录和存储，不申请用户数据权限", () => {
    expect(manifest.permissions.filter(p => !p.startsWith("ai:"))).toEqual([]);
  });

  it("页面依赖首页、侧边栏与 AI，只声明桌面", () => {
    expect(Object.keys(manifest.targets)).toEqual(["desktop"]);
  });
});
