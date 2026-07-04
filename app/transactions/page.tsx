import { AppSidebar } from "@/components/app-sidebar";
import { TransactionsBoard } from "@/components/transactions-board";

export const dynamic = "force-dynamic";

export default function TransactionsPage() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <TransactionsBoard />
    </div>
  );
}
