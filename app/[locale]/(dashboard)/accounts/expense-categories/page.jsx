// Server Component: بنود المصروفات
import { Suspense } from "react";
import { connection } from "next/server";
import { getPageAccess } from "@/lib/auth";
import { getExpenseCategories } from "@/services/voucher.service";
import ExpenseCategoriesView from "@/components/accounts/ExpenseCategoriesView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content() {
  const { allowed } = await getPageAccess("expenseCategories.view");
  if (!allowed) return <NoAccess />;
  await connection();
  const categories = await getExpenseCategories();
  return <ExpenseCategoriesView categories={categories} />;
}

export default function Page() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content />
    </Suspense>
  );
}
