import { Peek } from "@/components/peek";
import { TransactionDetail } from "@/components/transaction-detail";

// A transaction opened from inside the app shows as a peek over the page you were on.
export default async function TransactionPeek({ params }: PageProps<"/transactions/[id]">) {
  const { id } = await params;
  return (
    <Peek href={`/transactions/${id}`} label="Transaction">
      <TransactionDetail id={id} />
    </Peek>
  );
}
