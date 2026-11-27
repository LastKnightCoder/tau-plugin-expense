import { defineI18n, type I18nDefinition, type TranslationValues } from "@tau/plugins";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});

/** 词典 key 的字面量联合：状态里存 key、非组件 helper 收翻译函数都用它 */
export type MessageKey = typeof messages extends I18nDefinition<infer Key> ? Key : never;

/** 传给非组件 helper（差异清单、写入动作）的翻译函数形态 */
export type Translate = (key: MessageKey, values?: TranslationValues) => string;
