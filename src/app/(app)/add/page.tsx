import { AddTransaction } from "@/components/add-transaction";
import { getHousehold } from "@/lib/household";

export const metadata = { title: "Add" };

// The full page for a refresh or a shared link; from inside the app, Add opens as a peek instead.
export default async function AddPage() {
  const h = await getHousehold();
  return (
    <div className="form-page add-page">
      <div className="nl-card">
        <AddTransaction accounts={h.accounts.filter((a) => !a.archived)} buckets={h.buckets} rules={h.rules} />
      </div>
    </div>
  );
}
