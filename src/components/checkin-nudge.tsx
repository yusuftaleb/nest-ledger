import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { getHousehold } from "@/lib/household";
import { checkInDue, lastCheckIn } from "@/lib/checkin";

/** On Home, once a week has gone by since the last check-in: a quiet way in. Streams in after the header. */
export async function CheckInNudge() {
  const h = await getHousehold();
  if (!checkInDue(await lastCheckIn(h), new Date())) return null;
  return (
    <Link href="/checkin" className="checkin-nudge">
      <CalendarCheck size={16} strokeWidth={1.75} aria-hidden />Weekly check-in
    </Link>
  );
}
