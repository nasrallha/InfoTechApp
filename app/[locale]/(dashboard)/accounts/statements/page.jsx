// Server Component: كشف حساب عميل/مورد (?kind=customer&id=5&from=...&to=...)
import { Suspense } from "react";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { dayEnd, dayStart, isDay } from "@/lib/dates";
import { parseId } from "@/lib/purchase-pages";
import { getStatement, getStatementParties } from "@/services/account.service";
import StatementView from "@/components/accounts/StatementView";
import NoAccess from "@/components/common/NoAccess";
import TableSkeleton from "@/components/common/TableSkeleton";

async function Content({ searchParams }) {
  const { user } = await getPageAccess();
  const kinds = ["customer", "supplier"].filter((k) =>
    can(
      user,
      k === "customer" ? "statements.customers" : "statements.suppliers",
    ),
  );
  if (!kinds.length) return <NoAccess />;
  await connection();
  const sp = await searchParams;
  const kind = kinds.includes(sp.kind) ? sp.kind : kinds[0];
  const id = parseId(sp.id);
  const from = isDay(sp.from) ? sp.from : null;
  const to = isDay(sp.to) ? sp.to : null;

  const [parties, statement] = await Promise.all([
    getStatementParties(kind),
    id
      ? getStatement(kind, id, {
          from: from ? dayStart(from) : undefined,
          to: to ? dayEnd(to) : undefined,
        })
      : null,
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
