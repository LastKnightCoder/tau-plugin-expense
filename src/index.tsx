import { Wallet } from "lucide-react";
import { SIDEBAR_GROUPS, definePlugin, type PluginPageProps, type PluginSettingsProps } from "@tau/plugins";
import { registerCollections } from "./data/store";
import { messages, type MessageKey } from "./i18n";
import { createRuntime, RuntimeProvider } from "./runtime";
import { ExpensePage } from "./ui/ExpensePage";
import { HomePanel } from "./ui/HomePanel";
import { MobileExpensePage } from "./ui/mobile/MobileExpensePage";
import { MobileHomePanel } from "./ui/mobile/MobileHomePanel";
import { MobileSettings } from "./ui/mobile/MobileSettings";
import { MobileViews, type MobileView } from "./ui/mobile/MobileViews";
import { SettingsForm } from "./ui/SettingsForm";
import "./styles.css";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

/** 手机二级页：页面 ID、标题 key、对应的 view；分类详情按分类区分实例 */
const MOBILE_VIEWS: { id: MobileView; titleKey: MessageKey; params?: boolean }[] = [
  { id: "calendar", titleKey: "app.page.calendar" },
  { id: "categories", titleKey: "app.page.categories" },
  { id: "category", titleKey: "app.page.category", params: true },
  { id: "review", titleKey: "app.page.review" },
  { id: "search", titleKey: "app.page.search" },
];

export default definePlugin({
  ...__PLUGIN_META__,
  i18n: messages,
  create: () => ({
    activate(context) {
      registerCollections(context);
      const runtime = createRuntime(context);
      // 手机另有一套为触控设计的界面；数据、统计口径与 AI 两端共用
      const mobile = context.environment.platform === "android" || context.environment.platform === "ios";
      const wrap = (node: React.ReactNode) => <RuntimeProvider runtime={runtime}>{node}</RuntimeProvider>;
      const page = context.pages.register({
        id: "expense",
        title: messages.ref("app.page.title"),
        component: (props: PluginPageProps) => wrap(mobile ? <MobileExpensePage {...props} /> : <ExpensePage {...props} />),
      });
      runtime.pages.main = page;
      if (mobile) {
        for (const view of MOBILE_VIEWS)
          runtime.pages[view.id] = context.pages.register({
            id: view.id,
            title: messages.ref(view.titleKey),
            ...(view.params ? { match: "params" as const, getId: params => String(params.id ?? "") } : {}),
            component: (props: PluginPageProps) => wrap(<MobileViews {...props} view={view.id} />),
          });
        context.navigation.registerEntry({ id: "expense", title: messages.ref("app.nav.title"), icon: Wallet, page });
      } else
        context.sidebar.registerItem({
          id: "expense",
          title: messages.ref("app.page.title"),
          icon: Wallet,
          group: SIDEBAR_GROUPS.daily,
          page,
        });
      const settings = context.settings.register({
        id: "budget",
        title: messages.ref("app.settings.title"),
        description: messages.ref("app.settings.description"),
        component: (props: PluginSettingsProps) => wrap(mobile ? <MobileSettings /> : <SettingsForm {...props} />),
      });
      // 手机从主页齿轮进的是插件页：面板接系统返回，有改动没保存时离开先确认
      runtime.pages.settings = mobile
        ? context.pages.register({
            id: "settings",
            title: messages.ref("app.page.settings"),
            component: (props: PluginPageProps) => wrap(<MobileSettings pageContext={props.pageContext} />),
          })
        : settings;
      context.home.registerPanel({
        id: "month",
        title: messages.ref("app.page.title"),
        size: "compact",
        action: { title: messages.ref(mobile ? "app.home.action.viewMobile" : "app.home.action.view"), run: () => page.open() },
        component: props => wrap(mobile ? <MobileHomePanel {...props} /> : <HomePanel />),
      });
      context.commands.register({
        id: "add",
        title: messages.ref("app.command.add"),
        run: async () => {
          await page.open({ add: true });
          return null;
        },
      });
    },
  }),
});
