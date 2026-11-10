// Server Component: كشف حساب عميل/مورد (?kind=customer&id=5&from=...&to=...)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { dayEnd, dayStart, isDay } from "@/lib/dates";
import { parseId } from "@/lib/purchase-pages";
import { statementBranch } from "@/lib/party-scope";
import {
  getCombinedStatement,
  getLinkedParties,
  getStatement,
  getStatementParties,
} from "@/services/account.service";
import StatementView from "@/components/accounts/StatementView";
import CombinedStatementView from "@/components/accounts/CombinedStatementView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user } = await getPageAccess();
  const kinds = [
    ...["customer", "supplier"].filter((k) =>
      can(
        user,
        k === "customer" ? "statements.customers" : "statements.suppliers",
      ),
    ),
    // كشف مشترك للعميل اللي هو مورد
    ...(can(user, "statements.combined") ? ["combined"] : []),
  ];
  if (!kinds.length) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const kind = kinds.includes(sp.kind) ? sp.kind : kinds[0];
  const id = parseId(sp.id);
  const from = isDay(sp.from) ? sp.from : null;
  const to = isDay(sp.to) ? sp.to : null;
  // موظف الفرع: أطراف فرعه، وحركات فرعه بس
  const range = {
    from: from ? dayStart(from) : undefined,
    to: to ? dayEnd(to) : undefined,
    branchId: statementBranch(user),
    user,
  };

  if (kind === "combined") {
    const customerId = parseId(sp.customer);
    const supplierId = parseId(sp.supplier);
    const [customers, suppliers, links, statement] = await Promise.all([
      getStatementParties("customer", user),
      getStatementParties("supplier", user),
      getLinkedParties(),
      customerId && supplierId
        ? getCombinedStatement(customerId, supplierId, range)
        : null,
    ]);
    return (
      <CombinedStatementView
        kinds={kinds}
        customers={customers}
        suppliers={suppliers}
        links={links}
        customerId={statement ? customerId : null}
        supplierId={statement ? supplierId : null}
        from={from}
        to={to}
        statement={statement}
        canOffset={can(user, "offsets.create")}
        canOffsetDate={can(user, "offsets.changeDate")}
      />
    );
  }

  const [parties, statement] = await Promise.all([
    getStatementParties(kind, user),
    id ? getStatement(kind, id, range) : null,
  ]);

  return (
    <StatementView
      kinds={kinds}
      kind={kind}
      partyId={statement ? id : null}
      from={from}
      to={to}
      parties={parties}
      statement={statement}
    />
  );
}

export default function Page({ searchParams }) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
