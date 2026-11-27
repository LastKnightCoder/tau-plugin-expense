# Expense Tracker

Log every expense in a single line and always know how much you have left to spend this month. A calendar, category budgets, and 6-month charts show where your money goes, while AI helps spot where you can save.

## What It Can Do

- **One-line logging**: Type `"Lunch beef noodles 28"` and press Enter to save—the amount and category are detected automatically. Start with `"yesterday"` or `"two days ago"` to log on that date. If a category isn't recognized, tap one to assign it; the same wording will be matched automatically next time, or you can let AI classify it.
- **Left to spend**: The top summary shows your remaining monthly budget and how much you can spend per day for the rest of the month. The vertical mark on the progress bar marks today's pace through the month, alerting you if spending runs ahead of schedule.
- **Calendar**: See how much you spent each day and your largest transaction. Colored bars at the bottom of each cell indicate spending volume (half a bar equals your daily allowance) and category breakdown. Tap any day to filter the records list on the right.
- **Budgets**: Each category appears on its own row showing spent vs. budget, whether spending is running fast or over budget, and how it compares to your 3-month average. Tap a category to filter both the calendar and records.
- **Fixed expenses**: Enter recurring monthly bills like rent, phone plans, or memberships once in Settings, and they are auto-logged on their scheduled day. They are labeled separately and kept out of the calendar and daily averages so they don't skew everyday spending.
- **Review & AI**: View your monthly spending breakdown over the last 6 months and see which days of the week cost the most. Tap any month's bar to jump to that month.
- **AI**: **Tips** tells you how much you can spend per day for the rest of the month and which categories need restraint; **Monthly review** highlights where you spent more than usual and suggests how much you could save.
- **Home card**: See your monthly balance and log an expense right from the **Today** page.
- **Mobile experience**: Purpose-built touch UI on Android and iOS. Hold the mic and say `"lunch 28, taxi home 36"` to log multiple items at once; swipe left on a record to edit or delete it, with dedicated pages for Calendar, Budgets, and Review & AI.

## Getting Started

1. Install and enable **Expense Tracker** in the Plugin Center.
2. Open **Settings** on the plugin details page to adjust each category's monthly budget and add fixed expenses such as rent and memberships.
3. Click **Expenses** in the Sidebar and type a line whenever you spend. On mobile, find **Expense Tracker** at the top of **Me**, or use the card on the **Today** page.

## FAQ

**What can AI see?** Only category totals and the note text you write—it never reads your other notes. AI uses the model assigned to chat, asks for authorization on first use, and can be revoked anytime under **Permissions** on the plugin details page. You can also use Expense Tracker completely without AI.

**What speech recognition does mobile voice input use?** It uses the recognition engine selected in Tau under **Me › Voice › Speech Input**. The first time you hold to speak, you'll be asked to grant speech input permission, which you can revoke anytime under **Permissions** on the plugin details page. It works even without an AI model by splitting sentences and classifying with local rules.

**Does my data sync?** Yes. Records and settings are stored in your library and sync along with it.

**What happens to records if I delete a category?** They move to **Others**—no amounts are lost.

**Not sure how to set budgets?** Track for a month or two first, then tap **Fill from the last 3 months' average** in Settings and trim down from there.
