import { AddBudget } from "@/components/add-budget";
import { Peek } from "@/components/peek";
import { budgetPlan } from "@/lib/budget-plan";

// A budget, opened from Plan or Home, comes up as a peek over the page you were on.
export default async function BudgetPeek({ searchParams }: { searchParams: Promise<{ bucket?: string }> }) {
  const [plan, { bucket }] = await Promise.all([budgetPlan(), searchParams]);
  return (
    <Peek href={bucket ? `/budgets/new?bucket=${encodeURIComponent(bucket)}` : "/budgets/new"} label="Budget">
      <AddBudget plan={plan} bucket={bucket} />
    </Peek>
  );
}
