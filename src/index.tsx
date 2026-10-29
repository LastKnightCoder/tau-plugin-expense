import { Wallet } from "lucide-react";
import { SIDEBAR_GROUPS, definePlugin, type PluginPageProps, type PluginSettingsProps } from "@tau/plugins";
import { registerCollections } from "./data/store";
import { createRuntime, RuntimeProvider } from "./runtime";
import { ExpensePage } from "./ui/ExpensePage";
import { HomePanel } from "./ui/HomePanel";
import { SettingsForm } from "./ui/SettingsForm";
import "./styles.css";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      registerCollections(context);
      const runtime = createRuntime(context);
      const page = context.pages.register({
        id: "expense",
        title: "记账",
        component: (props: PluginPageProps) => (
          <RuntimeProvider runtime={runtime}>
            <ExpensePage {...props} />
          </RuntimeProvider>
        ),
      });
      runtime.pages.main = page;
      context.sidebar.registerItem({
        id: "expense",
        title: "记账",
        icon: Wallet,
        group: SIDEBAR_GROUPS.daily,
        page,
      });
      runtime.pages.settings = context.settings.register({
        id: "budget",
        title: "分类、预算与固定支出",
        description: "每个分类的月预算，以及每月自动记入的固定支出",
        component: (props: PluginSettingsProps) => (
          <RuntimeProvider runtime={runtime}>
            <SettingsForm {...props} />
          </RuntimeProvider>
        ),
      });
      context.home.registerPanel({
        id: "month",
        title: "记账",
        size: "compact",
        component: () => (
          <RuntimeProvider runtime={runtime}>
            <HomePanel />
          </RuntimeProvider>
        ),
      });
      context.commands.register({
        id: "add",
        title: "记账：记一笔",
        run: async () => {
          await page.open({ add: true });
          return null;
        },
      });
    },
  }),
});
