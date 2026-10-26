import { AddBudget } from "@/components/add-budget";
import { budgetPlan } from "@/lib/budget-plan";

export const metadata = { title: "Budget" };

// The full page for a refresh or a shared link; from Plan or Home, a budget opens as a peek instead.
export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ bucket?: string }> }) {
  const [plan, { bucket }] = await Promise.all([budgetPlan(), searchParams]);
  return (
    <div className="form-page add-page">
      <div className="nl-card">
        <AddBudget plan={plan} bucket={bucket} />
      </div>
    </div>
  );
}
