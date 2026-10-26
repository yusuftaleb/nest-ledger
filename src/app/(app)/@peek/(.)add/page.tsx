import { AddTransaction } from "@/components/add-transaction";
import { Peek } from "@/components/peek";
import { getHousehold } from "@/lib/household";

// Add, opened from anywhere in the app, comes up as a peek over the page you were on.
export default async function AddPeek() {
  const h = await getHousehold();
  return (
    <Peek href="/add" label="New transaction">
      <AddTransaction accounts={h.accounts.filter((a) => !a.archived)} buckets={h.buckets} rules={h.rules} />
    </Peek>
  );
}
