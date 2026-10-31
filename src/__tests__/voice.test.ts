import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "../data/model";
import { chineseToNumber, normalizeNumbers, parseOrganized, splitSpeech } from "../data/voice";

const cats = DEFAULT_CATEGORIES.map(c => ({ ...c }));

describe("中文数字", () => {
  it("认口语里的金额写法", () => {
    expect(chineseToNumber("二十八")).toBe(28);
    expect(chineseToNumber("十五")).toBe(15);
    expect(chineseToNumber("三百二")).toBe(320);
    expect(chineseToNumber("三百二十")).toBe(320);
    expect(chineseToNumber("一百零五")).toBe(105);
    expect(chineseToNumber("两千")).toBe(2000);
    expect(chineseToNumber("一万二")).toBe(12000);
    expect(chineseToNumber("十二点五")).toBe(12.5);
    expect(chineseToNumber("三六")).toBe(36);
    expect(chineseToNumber("好")).toBeNull();
  });

  it("只把像金额的中文数字换掉，量词前的保留", () => {
    expect(normalizeNumbers("牛肉面二十八")).toBe("牛肉面28");
    expect(normalizeNumbers("打车回家三十六块")).toBe("打车回家36块");
    expect(normalizeNumbers("一碗牛肉面十五")).toBe("一碗牛肉面15");
    expect(normalizeNumbers("可乐三块五")).toBe("可乐3.50元");
    expect(normalizeNumbers("十二点吃了个饭三十")).toBe("十二点吃了个饭30");
  });

  it("块后面的角、分只在跟着毛 / 角或句末时算，量词前的数字不吞", () => {
    expect(normalizeNumbers("葡萄十五块一斤")).toBe("葡萄15块一斤");
    expect(normalizeNumbers("红包两百块一个")).toBe("红包200块一个");
    expect(normalizeNumbers("西瓜二十块两个")).toBe("西瓜20块两个");
    expect(normalizeNumbers("白菜两块五一斤")).toBe("白菜2.50元一斤");
    expect(normalizeNumbers("可乐八块八毛八")).toBe("可乐8.88元");
    expect(normalizeNumbers("早餐一块二毛五")).toBe("早餐1.25元");
    expect(normalizeNumbers("快递二十块零五毛")).toBe("快递20.50元");
    expect(normalizeNumbers("地铁五块")).toBe("地铁5块");
  });
});

describe("本地拆句", () => {
  it("按句拆开，各自识别金额与分类", () => {
    expect(splitSpeech("中午牛肉面二十八，晚上打车回家三十六", cats, {})).toEqual([
      { note: "牛肉面", cents: 2800, category: "food", dayOffset: 0, source: "keyword" },
      { note: "打车回家", cents: 3600, category: "trans", dayOffset: 0, source: "keyword" },
    ]);
  });

  it("认不出的归到其他，没说金额的留空", () => {
    expect(splitSpeech("早上咖啡十五，然后地铁五块，还有那个快递", cats, {})).toEqual([
      { note: "咖啡", cents: 1500, category: "food", dayOffset: 0, source: "keyword" },
      { note: "地铁", cents: 500, category: "trans", dayOffset: 0, source: "keyword" },
      { note: "那个快递", cents: null, category: "other", dayOffset: 0, source: null },
    ]);
  });

  it("后面的句子沿用前一句说的日子，说了今天再换回来", () => {
    expect(splitSpeech("昨天午饭三十，打车二十，今天咖啡十五", cats, {}).map(i => [i.note, i.cents, i.dayOffset])).toEqual([
      ["午饭", 3000, -1],
      ["打车", 2000, -1],
      ["咖啡", 1500, 0],
    ]);
  });

  it("记过的备注优先，昨天的记到昨天", () => {
    expect(splitSpeech("昨天理发四十五", cats, { 理发: "shop" })).toEqual([
      { note: "理发", cents: 4500, category: "shop", dayOffset: -1, source: "alias" },
    ]);
  });
});

describe("AI 整理结果", () => {
  it("只接受已有分类，金额换成分，非法条目丢弃", () => {
    const reply = `好的：{"items":[{"note":"牛肉面","yuan":28,"category":"food","day":0},{"note":"毛衣","yuan":320.5,"category":"gift","day":-1},{"note":"快递","yuan":null,"category":"other","day":5},{"yuan":3}],"advice":"本月还能花 2880 元。"}`;
    expect(parseOrganized(reply, cats)).toEqual({
      items: [
        { note: "牛肉面", cents: 2800, category: "food", dayOffset: 0, source: "ai" },
        { note: "毛衣", cents: 32050, category: "other", dayOffset: -1, source: "ai" },
        { note: "快递", cents: null, category: "other", dayOffset: 0, source: "ai" },
      ],
      advice: "本月还能花 2880 元。",
    });
  });

  it("没有可用条目或不是 JSON 时返回 null", () => {
    expect(parseOrganized('{"items":[]}', cats)).toBeNull();
    expect(parseOrganized("不知道", cats)).toBeNull();
  });
});
