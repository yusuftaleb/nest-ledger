---
name: Nest Ledger
description: A household money notebook built on the Notion design system (github.com/VoltAgent/awesome-design-md, design-md/notion/DESIGN.md). Warm paper canvas, white cards on hairlines, near-black Inter, and exactly one accent, Notion blue.
colors:
  canvas-soft: "light-dark(#f6f5f4, #191919)"
  surface: "light-dark(#ffffff, #202020)"
  surface-sunk: "light-dark(#f1f0ee, #2a2a2a)"
  hairline: "light-dark(#e6e6e6, #2f2f2f)"
  input-border: "light-dark(#dddddd, #3f3f3f)"
  ink: "light-dark(#0d0d0d, #e6e6e5)"
  ink-secondary: "light-dark(#31302e, #c9c8c5)"
  ink-muted: "light-dark(#615d59, #9b9a97)"
  ink-faint: "light-dark(#a39e98, #6f6e69)"
  primary: "light-dark(#0075de, #2383e2)"
  primary-pressed: "light-dark(#005bab, #1a6dc4)"
  link: "light-dark(#0075de, #529cca)"
  hover: "rgb(55 53 47 / 0.06)"
  over: "light-dark(#c92a2a, #ff7d73)"
  warn: "light-dark(#8a3c00, #ffa344)"
  series-spend: "light-dark(#37352f, #d4d4d2)"
  series-income: "{colors.primary}"
  series-prev: "light-dark(#d3d1cb, #4a4a48)"
  tags: "#337ea9 blue, #d9730d orange, #9065b0 purple, #cb912f yellow, #c14c8a pink, #9f6b53 brown, #4954a8 indigo, #9b9a97 grey (no green)"
  egg: "#62aef0 (logo only)"
typography:
  family: "Inter (NotionInter substitute), lnum + locl"
  display: "46px / 700 / -1.5px (summary sentence, balance)"
  heading-1: "40px / 700 / -1px (page titles on desktop; 30px phone)"
  heading-2: "26px / 700 / -0.625px (page sections)"
  heading-3: "22px / 700 / -0.25px (explorer title, goal %)"
  card-title: "18px / 700 / -0.25px"
  body: "16px / 400 / 1.5"
  body-sm: "15px / 400 (inputs, buttons 500)"
  caption: "13-14px / 400"
rounded:
  xs: "4px inputs"
  sm: "5px menu rows, sidebar rows"
  md: "8px buttons, menus"
  lg: "12px cards"
  xl: "16px"
  full: "pills: chips and badges only"
elevation:
  card: "hairline only"
  raised: "Notion level 1 (four near-transparent layers): selected segment, focused input"
  pop: "Notion level 2: menus, tooltips, the bulk-edit bar"
---

# Nest Ledger design

Source of truth: `src/app/tokens.css` (tokens), `src/app/globals.css` (components), `src/app/dashboard.css` (dashboard and charts). Reference page: `docs/design-system-notion.html`.

## Overview

A shared money notebook for one household, usually two adults who both sign in. It is checked on a phone between other things and reviewed on a laptop at night. The tone is calm and plain-spoken: it notices things for you instead of alarming you.

The identity comes from the name: a nest egg. Eggshell paper (cool, faintly green neutrals, never warm cream), spruce ink, and one signature colour, robin's-egg blue, which is the egg in the mark and the colour of money coming in. Spending is graphite, the plain colour of money. Interface chrome stays quiet so the numbers carry the page.

The dashboard is data-driven. Every card is a `widgets` row (`type` + `spec`), so every card must look right for any data, including empty, and new cards need no layout code.

## Colors

- **Neutrals carry the interface.** Use page, surface, surface-sunk, line and ink. Muted ink is for captions and axis text only, and it passes 4.5:1 in both themes.
- **Spruce accent** (lifted to robin's egg in dark): only for the primary action, focus rings, links, the current place in the navigation and the Today button.
- **Robin's egg** (`--egg`, `--egg-deep`): the logo, money in, and "kept" in the summary sentence. Never decoration.
- **Status colours** (good, warn, over) always mean good, warning or over budget, and always come with a word or icon. They are never used as a chart series.
- **Direction of money:** money in is robin's egg; spending totals are positive numbers in neutral ink (`<Amount tone="neutral">`). Never let a spend total turn green.
- **Bucket colours** `--cat-1` to `--cat-8` are validated categorical hues; 8 is the neutral "everything else". A bucket stores its slot ("1"–"8") or any CSS colour. When two buckets in one chart share a slot, the chart gives the second one the next free colour.
- **Chart colours:**
  - Money out is graphite, money in is robin's egg, the previous period is a pale grey. The pair differs in lightness as well as hue, so it survives colour blindness and greyscale.
  - Comparisons are orange for "more" and blue for "less" (warm against cool).
  - Heatmaps (calendar, matrix) use the graphite ramp, light to dark.
- **Themes:**
  - Every token is written as `light-dark(light, dark)`.
  - The System / Light / Dark switch (Settings and the desktop sidebar) sets `data-theme` on `<html>` and stores a `theme` cookie, so the server's first paint is already in the chosen theme.
  - Dark is spruce-black, designed for dark, not inverted.

## Typography

- **Reading and controls:** the platform's own face (`-apple-system, system-ui`), which is San Francisco on iPhones and Macs. It costs nothing to load and feels native.
- **Headings and big numbers:** Familjen Grotesk ("the family" grotesque), self-hosted through `next/font`, weight 600 with tight tracking. It is the one place the brand speaks in type.
- **Summary statement:** 30/44px Familjen, the only text that size on a page.
- **Columns of numbers:** tabular figures (lists, tables, axis ticks). The summary sentence uses proportional figures.
- **Sizes:** titles 30/34px, card headings 18px, body 16px, captions 13px, chart labels 11–12px.
- **Copy:**
  - Sentence case, plain words: "Money in", "Can spend a day", "Needs a look", "kept".
  - Insights are full sentences with whole dollars. A finished period is described as a whole ("in September"), the current one as "so far".
  - Every card states its time span in its caption, so the period switch is never ambiguous.
  - No em-dashes in the interface.

## Layout

- **Phones:** one column, max 640px, a bottom tab bar with one purple Add square, and safe-area padding.
- **From 700px:** 880px column, two-column card grid.
- **From 1024px:**
  - A 240px sidebar replaces the tab bar. It holds the brand, Add transaction, the navigation and the theme switch.
  - The main area grows to 1320px.
- **From 1280px:** a 6-column grid. `spec.span`: full = 6, wide = 4, half = 3, third = 2. Phones always stack. Default spans live in `DEFAULT_SPAN` in `widgets.tsx`.
- **Rows are composed, not poured.** Grid rows stretch, so a short card beside a tall one turns into an empty tile. Pair cards of similar height: wide + third (chart + sentences), half + half (two lists), third + third + third (three compact cards). The default Home and Plan in `default_widgets()` follow this.
- **Cards respond to their own width.** Every tile is a size container (`container-type: inline-size`), so a chart adapts to the card, not the window. A wide Net worth puts the chart beside the accounts. Wide charts get a taller plot. A narrow 12-month in/out chart drops its net labels, which are still in the tooltip and table.
- **Rhythm:** a 4px base (4, 8, 12, 16, 20, 24, 32, 40). Groups are tight inside tiles (12–16px), with 16px between tiles and 24px between page sections.
- **Page head:** a greeting in the viewer's own time zone, today's date, and the period switch on the right.

## Elevation & Depth

Nearly flat. Tiles are a surface on the page colour with a soft 1px line and a 1px, 4% shadow, enough to lift them off the paper without looking like floating cards. The segmented control's selected pill and the primary button carry the only other small shadows. The only shadows are the chart tooltip (0 6px 16px, 18% black) and the 2px surface ring that keeps dots and budget markers legible over lines.

## Shapes

- **Radii:** 4px for bar data-ends and tracks, 6px for tags and calendar cells, 8px for buttons and inputs, 12px for tiles and the summary band. Pills only for the summary's "needs a look" link.
- **Bars:** at most 24px thick, rounded at the data end and square at the baseline. Stacked segments are separated by a 2px surface gap, never a stroke.
- **Lines and grid:** lines are 2px; gridlines are 1px solid hairlines (never dashed).

## Components

- **Summary:** no box and no band. One sentence in Familjen on the page itself ("$3,507 in, $3,553 out. $46 more went out."), with "kept" in robin's egg or "more went out" in orange, a day-of-month hairline while the month is under way, then up to four facts in a row: against last period, left in budgets, can spend a day, needs a look.
- **Logo:** a speckled robin's egg in a straw nest on a spruce tile (`src/components/logo.tsx`, `src/app/icon.svg`, `src/app/apple-icon.tsx`). The wordmark is Familjen 600.
- **Menus** (`src/components/menu.tsx`): every choice in the app is the same Notion-style dropdown: a quiet bordered button reading "Label Value ⌄", opening a small raised list with a check on the chosen option, arrow keys and Enter, a search box once a list is longer than eight. Multi-select menus (Bucket, Account, Person) tint the button when set. Native `<select>` is only used inside forms.
- **Filter row** (`filter-menus.tsx`): Dates, Bucket, Account and Person menus under every search box. They read and write the search text, so the chips and the menus always agree.
- **Side rail:** 216px, 34px items. The current page lists its sections underneath (cards by title, plus Explore and Patterns on Analysis); each jumps there and the one in view is highlighted as you scroll.
- **Home is a glance:** the summary (with today's money in the accounts), balances, the budgets that matter, what's worth knowing, recent. Detail lives in Activity, Analysis and Plan.
- **Balances:** each account's balance now (last recorded + everything since), money held first, then cards and loans owed; plain amounts, no "+".
- **Goals editing:** each egg has an Edit link; Add a goal is a dashed egg. The form (name, target, optional date, progress from transfers or a linked account's balance) opens under the eggs with Archive and Delete; delete warns when the goal has transactions.
- **Period control:** Month / Quarter / Year as an Apple segmented control (a raised pill in a tinted track), then back and forward arrows around a dropdown of every period since the first transaction, and a Today button when looking at the past. The choice lives in the URL (`?p=quarter&at=2026-07-01`). A past period is read as of its last day; cards that only make sense now (the forecast, "can spend a day") say so.
- **Tile:** a heading plus a caption with the time span, and an optional "See all" link. Content follows. A foot line sits at the bottom.
- **Charts:**
  - `src/components/charts.tsx` (Columns, PairedColumns, PaceChart, SpendCalendar, Legend, ChartTable). Drawn on the server as HTML/SVG.
  - One client `ChartTip` gives hover and keyboard tooltips.
  - Every chart has a "Show as table" twin.
  - A legend is shown whenever there are two or more series.
  - Values are labelled selectively: the current month, the end of a line, the average.
  - Comparisons only appear when the history reaches back far enough (`covers()` in `src/lib/insights.ts`).
- **Insights:** up to 6 sentences, each with a toned Lucide icon (good, warn, info). They only appear when the data supports them, never as filler. Home speaks about this period. Plan's "The long view" (`outlook`) covers the last 12 full months: a typical month, how many months savings would cover, what is rising, the income mix, and the best month.
- **Summary per-day line:** "Can spend a day" is what's left in the budgets divided by the days remaining, today included. It only shows while the month is under way and money is left.
- **Bills:** a month line with a dot per regular charge (filled = paid, hollow = still to come) and a 2px today tick, then up to five rows. Each row has a date tile, the place and bucket, the amount, and Paid / Coming / Not seen yet. When everything is in, the card says "All paid" instead of "$0.00 to come".
- **Matrix:** a real table of top buckets × months in one hue, five steps. Each row is shaded against its own busiest month, so rent and gifts are both readable. The bucket column stays put while the months scroll on a phone. Exact amounts are in the tooltips and the screen-reader text.
- **Savings rate:** columns from a zero line. Income green above (kept), spending purple below (spent past income), the average as a hairline.
- **Budgets:** the design system's `BudgetBar` (`src/components/budget-bar.tsx`): what's left in large text ("$188 left", "$32 over"), spent of budget in small text, and a bar that is green below 80%, orange from 80% and red past 100%, with a 2px marker at the limit when over. Bars stack in one card divided by hairlines, two columns when the card is wide. Home shows the five most used; Plan shows all.
- **Goals:** each goal is a nest egg (`src/components/goal-egg.tsx`) that fills with robin's egg from the bottom as money is saved, with the percentage, saved of target and the monthly amount needed written underneath. A reached egg gets a deeper outline and says "Reached".
- **Analysis is one explorer, not a wall of charts.** Two scopes, and each looks like what it is. The page: filters (search, Dates, Bucket, Account, Person, Type, Amount, Status) and "X compared with [▾]" sit above everything and change everything below, Patterns and Insights included. Dates start on This month and the comparison on Nothing. One card: its tabs and its "Show … by …" sentence change only that card. Tapping inside a chart never filters the page. It opens a sheet with what is behind the mark, and "Show only X" in that sheet is the one way a chart narrows the page.
- **Explorer tabs, named for the question they answer:** Where it went (bars by any group; "Where it came from" for income), In and out (a money flow on wide cards and a waterfall on narrow ones), Shares (four rings), When it went (days, weeks or months), Pace (this month's running total inside the usual range), What and when (group × time grid) and Year by year ("Every October" when the search picks a month). On a phone the tabs use one-word names (Where, Flow, Shares, When, Pace, Grid, Years) in two rows.
- **One headline per chart, then the chart:** every tab opens with a small kicker, one large answer and at most two short facts after it ("Spending / $3,609.17 / Rent & utilities took the most, 49%"). Numbers beyond that live in tooltips, sheets and the table, never on every mark.
- **This month's weight:** a "Lighter than usual", "About usual" or "Heavier than usual" badge beside the title compares spending so far with the average of the last 6 months by the same day (Pace's dashed line). More than 10% under is lighter, more than 10% over is heavier. Tapping it says by how much, in one sentence. It needs 3 earlier months.
- **In and out:** the headline is what was left ("$412 left", or "$96 overspent") with "$X in · $Y out" under it. Where money came from is on the left, and the buckets it went to, "Set aside" and "Left" (or "Overspent" on the left when more went out than came in), are on the right. The sources run together into one income-blue bar in the middle, then it splits out to the buckets, so no ribbon claims that a given source paid for a given bucket. Each ribbon is a soft, translucent band as wide as its money. Its color fades from its node's color to the bar's blue. At both ends a ribbon starts behind a pill, the bar included, only as tall as that pill's straight side, so it meets the rounded ends cleanly. Ribbons are opaque inside one see-through group, so their overlaps don't darken. Nodes are thin pills in their bucket's color, labelled with the name in bold and the amount under it. Hovering a node or ribbon lights its ribbon and dims the rest, and hovering the bar lights them all; a node grows slightly under the pointer. On a narrow card the same story is a waterfall: Came in, each bucket stepping down, then Left or Overspent. Nodes and steps open their transactions.
- **Pace:** a grey band for the range of the last 6 months by day, a dashed line for their average, and this month drawn in accent up to today with a dot. The headline says how far above or below usual it is by today.
- **Year by year:** one column per year with the usual (average of whole years) as a dashed line labelled "usual $3.2K". This year's column adds a dashed projection to where it is heading, and each past year carries a tick where it stood by today's date, so "so far" is compared fairly. A column opens that year's transactions.
- **Balance and privacy:** on desktop, "In your accounts" sits on the right of the summary, divided by a hairline. The eye button blurs every balance in place (summary, Balances, net worth) and is remembered in a cookie, so nothing flashes.
- **Forms:** one width (720px, two columns on the Add page on desktop). Fields use the app's menus (never a native select) styled as inputs, placeholders read "e.g. …", optional fields say so beside the label, money fields carry a $ prefix.
- **Folding:** every card and page section folds to its heading with a chevron; the choice is a cookie the server reads, so nothing flashes.
- **Saved views:** one "Views" menu beside the filters, like the other menus. It lists the saved views (a tick on the one showing, an × to delete on hover) and "Save this view" at the bottom. The button shows the name of the view on screen.
- **No scope notes:** Patterns and Insights carry no "uses the filters above" lines. Filters at the top of the page apply to the whole page, like a dashboard.
- **Older note, Analysis explorer:** "Same time, every year" compares with last year everywhere. A comparison only appears when the history reaches back far enough.
- **Patterns:** short cards with a toned 40px icon tile: prices that went up, bigger than usual, one-off costs (with a typical month without them), months that cost more (a 12-column seasonal strip), and when money comes in.
- **Settings:** Apple-style grouped lists in a 720px column: a small grey section title, one card per group with hairline rows, "Add …" rows that open in place, initials avatars, hidden rows dimmed by class.
- **Segmented control:** an Apple-style switch drawn in Notion rectangles: a 3px inset track, the selected segment raised on the surface. 36px tall, 44px on touch screens.
- **Transaction rows:** the icon is centred on the row, with 2px between the amount and its badge. In a card (Home's Recent), rows reach the card's edges so the whole width is tappable, but their content and the dividers between them line up with the card title.
- **Numbers open what's behind them:** on Home, money in, spent, "Needs a look", each budget and each bill open their transactions in a center peek (`/transactions/list?q=…&t=…`). They look like plain numbers and underline on hover.
- **Undo, not "are you sure":** deleting, bulk edits, quick review, "not a bill" and finishing a check-in happen at once, and a dark bar at the bottom says what happened, with Undo for 7 seconds (longer while hovered). Deleting a goal still asks first, because Undo can't put back everything a goal touches.
- **Quick review:** a transaction that needs a look opens with one question ("Is Groceries right?"), a "Looks right" button, the buckets this place has used before as chips, and a menu of every bucket.
- **Swipe (touch only):** sliding a transaction row left shows "Checked" (or "Look at") and "Bucket". Only a sideways drag counts, so lists still scroll.
- **Legend picks lines:** in the running total, tapping a name hides or shows its line, and holding it (or Alt-clicking) shows only that line.
- **Budget rollover:** a monthly budget can carry what's left (or what went over) into next month; its bar then says "$40 carried over" or "$25 over last month taken off".
- **Bill reminders:** a quiet blue note above Home's cards names any regular bill that usually comes out in the next three days ("Amazon Prime usually comes out on Sun, Nov 1, about $5.59"). It goes away once the charge lands.
- **Weekly check-in:** `/checkin` shows the last 7 days, what to look at, what's coming and the budgets, then "Done for this week". Home shows a "Weekly check-in" pill once six days have passed since the last one.
- **Keyboard:** `/` search, `N` add, `←` `→` periods, `G` then `H`/`A`/`N`/`P` to go to a page, `?` lists them all.
- **Icons:** Lucide at 1.75 stroke. Bucket icons are stored by name and drawn on the server (`bucket-icon.tsx`). Client components use `CategoryIcon`.
- **Motion:** the one authored moment is that the money settles.
  - Bars grow from their baseline at 0.6–0.9s with an exponential ease-out.
  - The running total is drawn like a pen at an even pace: last period's line first (0.7s), then this period's up to today (1s). The shading then settles under it, and today's dot lands.
  - The bills month line fills up to today, then the bill dots pop in. Matrix rows fade in from the top.
  - Analysis: Where it went bars grow from the left, and the comparison tick fades in after them. Each Shares ring sweeps round from twelve o'clock through an SVG mask, 80ms after the one before. Pace's band and usual line fade in, then this month is drawn left to right and its dot lands. Year by year columns rise one after another (90ms apart, capped at 540ms) and the usual line fades in. The money flow is uncovered left to right. Waterfall steps grow from where the last one ended, 80ms apart. Charts play again when the dates, filters, grouping, measure or data change, but not on sorting or Show more.
  - Siblings are staggered, with the total delay capped at 280ms.
  - The default state is always fully visible.
  - Reduced motion gives a 0.2s fade instead.

## Do's and Don'ts

- **Do:**
  - State the time span on every card.
  - Compare against the same days of the last period, never a finished period against an unfinished one.
  - Keep spending totals in neutral ink.
  - Give every chart a table twin and every series a legend.
  - Write empty states that say what to do next, in the household's words.
- **Don't:**
  - Use status colours as series colours.
  - Use dashed gridlines or two y-axes.
  - Put a number on every bar.
  - Animate width or height.
  - Show developer language (table names, error codes) in the app.
  - Put a selector list and an `@media` block in the same rule. A pasted media query inside a selector list makes the browser drop the whole rule, which is how the bar animations once went missing.
  - Add a second statement-sized number to a page, or put the summary back in a coloured band.
