import { ChevronLeft } from "lucide-react";
import { iconProps } from "@/components/icons";
import { BackLink } from "@/components/back-link";
import { TransactionDetail } from "@/components/transaction-detail";

export const metadata = { title: "Transaction" };

// Opened from a shared link or a refresh; from inside the app the same transaction opens as a peek instead.
export default async function TransactionPage({ params }: PageProps<"/transactions/[id]">) {
  const { id } = await params;
  return (
    <div className="form-page">
      <BackLink href="/transactions"><ChevronLeft {...iconProps} size={18} />Activity</BackLink>
      <TransactionDetail id={id} />
    </div>
  );
}
