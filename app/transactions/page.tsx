import { redirect } from "next/navigation";

// 取引履歴の中身はマイページに統合した。古いリンクのために残す。
export default function TransactionsPage() {
  redirect("/me");
}
