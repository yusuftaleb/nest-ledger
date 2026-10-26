import { LOCALE } from "@/lib/format";
import { Suspense } from "react";
import { BoardSkeleton } from "@/components/skeleton";
import { WidgetBoard } from "@/components/widgets";
import { CheckInDone } from "@/components/checkin-done";
import { supabaseSource } from "@/lib/dashboard-source";
import { getHousehold } from "@/lib/household";
import { getToday } from "@/lib/today";
import { lastCheckIn } from "@/lib/checkin";

export const metadata = { title: "Weekly check-in" };

/**
 * Five minutes on a Sunday: the week's spending, what needs a look, what's coming up, and the budgets. The cards
 * are the `checkin` page of the widgets table; "Done for this week" remembers it for both of you.
 */
export default async function CheckInPage() {
  const [h, today] = await Promise.all([getHousehold(), getToday()]);
  const last = await lastCheckIn(h);
  const who = last?.by ? h.members.find((m) => m.user_id === last.by)?.display_name : null;
  const when = last ? new Date(last.at).toLocaleDateString(LOCALE, { weekday: "long", month: "long", day: "numeric" }) : null;
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="title">Weekly check-in</h1>
          <p className="caption">{when ? `Last done ${when}${who ? ` by ${who}` : ""}.` : "Your first one. It takes about five minutes."}</p>
        </div>
      </header>
      <Suspense fallback={<BoardSkeleton summary={false} />}>
        <WidgetBoard source={supabaseSource(h)} page="checkin" period="month" today={today} live />
      </Suspense>
      <footer className="checkin-foot">
        <p className="caption">Everything looked at? Mark the week done.</p>
        <CheckInDone />
      </footer>
    </>
  );
}
