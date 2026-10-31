/**
 * AI：沿用用户为「对话功能」分配的模型（manifest 声明 ai:chat，首次使用时 Tau 询问授权）。
 * 只发送插件算好的汇总与备注文字，不发送其他笔记。
 */
import type { PluginAICapabilityClient, PluginContext } from "@tau/plugins";
import { CLASSIFY_SYSTEM, classifyPrompt, parseClassify } from "./data/parse";
import { ORGANIZE_SYSTEM, organizePrompt, parseOrganized, type OrganizeContext, type Organized } from "./data/voice";
import { addDays, formatYuan, type Category, type Config, type Tx } from "./data/model";
import { isFixed, topNotes, type MonthStat, type MonthTotal } from "./data/stats";

export type AIScope = "tip" | "review";

export function createAI(context: Pick<PluginContext, "ai">) {
  let client: Promise<PluginAICapabilityClient> | null = null;
  const model = () => {
    // 授权被拒或未配置模型时允许下次重新申请
    client ??= context.ai.requestCapability("chat").catch(error => {
      client = null;
      throw error;
    });
    return client;
  };

  return {
    async classify(note: string, categories: readonly Category[], signal?: AbortSignal): Promise<string> {
      const result = await (await model()).chat({
        messages: [
          { role: "system", content: CLASSIFY_SYSTEM },
          { role: "user", content: classifyPrompt(note, categories) },
        ],
        maxOutputTokens: 60,
        signal,
      });
      const id = parseClassify(result.text, categories);
      if (!id) throw new Error("AI_BAD_REPLY：没有得到可用的分类");
      return id;
    },

    /** 语音记账：拆成几笔、归类并给一句提醒 */
    async organize(speech: string, categories: readonly Category[], ctx: OrganizeContext, signal?: AbortSignal): Promise<Organized> {
      const result = await (await model()).chat({
        messages: [
          { role: "system", content: ORGANIZE_SYSTEM },
          { role: "user", content: organizePrompt(speech, categories, ctx) },
        ],
        maxOutputTokens: 900,
        signal,
      });
      const organized = parseOrganized(result.text, categories);
      if (!organized) throw new Error("AI_BAD_REPLY：没有整理出可用的记录");
      return organized;
    },

    async *analyze(scope: AIScope, input: AnalysisInput, signal?: AbortSignal) {
      const stream = (await model()).stream({
        messages: [
          { role: "system", content: ANALYSIS_SYSTEM },
          { role: "user", content: analysisPrompt(scope, input) },
        ],
        maxOutputTokens: 800,
        signal,
      });
      for await (const event of stream) if (event.type === "text") yield event.delta;
    },
  };
}

export type ExpenseAI = ReturnType<typeof createAI>;

export const ANALYSIS_SYSTEM = `你是用户的记账助手，目标是帮用户控制支出、不超预算。
根据用户提供的数据给出简短、具体、可执行的中文反馈：
- 先说结论，再给建议；数字直接引用数据，不编造，金额单位是元。
- 固定支出（房租、订阅等）每月不变，分析时重点看可控支出；一次性大额（旅行、数码）单独指出，不当作日常习惯。
- 语气平实，不说教；不要使用 Markdown 标题，可以用 **粗体** 强调关键数字，建议可以用「- 」开头分行。`;

export interface AnalysisInput {
  today: string;
  now: string;
  config: Config;
  stat: MonthStat;
  history: readonly MonthTotal[];
  txs: readonly Tx[];
}

const yuan = (cents: number) => `${formatYuan(Math.round(cents))} 元`;

export function analysisPrompt(scope: AIScope, input: AnalysisInput): string {
  const { config, stat: s, history, txs, today, now } = input;
  const name = (id: string) => config.categories.find(c => c.id === id)?.name ?? "已删除分类";
  const monthTxs = txs.filter(t => t.date.startsWith(s.month));
  const left = s.budget - s.total;
  const lines = [
    `现在：${today} ${now}；本月 ${s.month}，共 ${s.days} 天，时间进度 ${Math.round(s.pace * 100)}%，剩 ${s.daysLeft} 天`,
    `月预算 ${yuan(s.budget)}，已花 ${yuan(s.total)}（固定 ${yuan(s.fixed)}，可控 ${yuan(s.flex)}），还剩 ${yuan(left)}`,
    "分类（名称 已花/预算 状态 前3月平均）：",
    ...s.categories
      .filter(c => c.spent || c.budget)
      .map(
        c =>
          `- ${name(c.id)} ${yuan(c.spent)}/${c.budget ? yuan(c.budget) : "不设"} ${{ ok: "正常", fast: "偏快", over: "已超" }[c.status]} ${c.average == null ? "无" : yuan(c.average)}`
      ),
  ];
  if (scope === "tip") {
    const recent = monthTxs.filter(t => !isFixed(t) && t.date >= addDays(today, -2));
    lines.push(
      "最近 3 天的可控支出：",
      ...(recent.length ? recent.map(t => `- ${t.date} ${t.time} ${name(t.category)} ${t.note || "无备注"} ${yuan(t.cents)}`) : ["- 没有"]),
      "请用不超过 100 字告诉用户：剩下几天每天最多花多少，哪个分类需要收着点。"
    );
  } else {
    lines.push("近几个月合计：" + history.map(m => `${m.month} ${yuan(m.total)}`).join("，"));
    for (const c of s.categories.filter(c => c.spent > 0).slice(0, 8)) {
      const top = topNotes(monthTxs.filter(t => t.category === c.id && !isFixed(t)), 4);
      if (top.length) lines.push(`${name(c.id)}的主要支出：` + top.map(n => `${n.note} ${yuan(n.cents)}（${n.count} 笔）`).join("，"));
    }
    const big = [...monthTxs].filter(t => !isFixed(t)).sort((a, b) => b.cents - a.cents).slice(0, 5);
    lines.push("本月最大的几笔：" + (big.length ? big.map(t => `${t.date} ${t.note || name(t.category)} ${yuan(t.cents)}`).join("，") : "无"));
    lines.push("请用不超过 220 字复盘本月：比平时多花或少花在哪、原因，再给 2–3 条带金额估算的省钱建议。");
  }
  return lines.join("\n");
}

/** 错误代码 → 给用户看的提示；返回 null 表示不用提示（已取消） */
export function aiErrorMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  if (/AI_ABORTED|AbortError/.test(message) || (error instanceof Error && error.name === "AbortError")) return null;
  if (message.startsWith("AI_NOT_CONFIGURED")) return "还没有为「对话功能」分配模型";
  if (message.startsWith("AI_DISABLED")) return "没有授权使用 AI";
  if (message.startsWith("AI_QUOTA_EXCEEDED")) return "插件的今日 AI 额度不足";
  if (message.startsWith("AI_CONCURRENCY_LIMIT")) return "AI 正忙，稍后再试";
  if (message.startsWith("AI_UNAVAILABLE")) return "当前设备不支持 AI";
  if (message.startsWith("AI_BAD_REPLY")) return message.includes("记录") ? "AI 没整理出来" : "AI 没认出分类";
  return "AI 请求失败";
}

export const needsSetup = (error: unknown) => error instanceof Error && /^AI_NOT_CONFIGURED/.test(error.message);
