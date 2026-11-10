import "server-only";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import { parseId, parsePage } from "@/lib/purchase-pages";
import {
  getVoucher,
  getVoucherOptions,
  listVouchers,
  VOUCHER_PERM,
} from "@/services/voucher.service";
import { getInvoicePrintSettings } from "@/services/invoice-print.service";
import VouchersList from "@/components/accounts/VouchersList";
import VoucherForm from "@/components/accounts/VoucherForm";
import VoucherDetails from "@/components/accounts/VoucherDetails";
import NoAccess from "@/components/common/NoAccess";

// ============================================================
// صفحات السندات (نفس الشاشات للأنواع الثلاثة)
// type: "receipt" | "payment" | "settlement"
// ============================================================

export async function VoucherListContent({ type, searchParams }) {
  const perm = VOUCHER_PERM[type];
  const { user, allowed } = await getPageAccess(`${perm}.view`);
  if (!allowed) return <NoAccess />;
  await connection();
  const { q = "", page } = await searchParams;
  const query = String(q).slice(0, 100);
  const data = await listVouchers({
    type,
    q: query,
    page: parsePage(page),
    user,
  });
  return (
    <VouchersList
      type={type}
      data={data}
      q={query}
      // المقاصة بتتعمل من الكشف المشترك
      canCreate={type !== "offset" && can(user, `${perm}.create`)}
    />
  );
}

export async function VoucherNewContent({ type, searchParams }) {
  const perm = VOUCHER_PERM[type];
  const { user, allowed } = await getPageAccess(`${perm}.create`);
  if (!allowed) return <NoAccess />;
  await connection();
  const sp = (await searchParams) ?? {};
  const [options, printSettings] = await Promise.all([
    getVoucherOptions(user),
    getInvoicePrintSettings(),
  ]);
  // فتح السند لعميل/مورد معيّن (?customer=5 / ?supplier=3)
  const preset = {
    customerId: parseId(sp.customer),
    supplierId: parseId(sp.supplier),
  };
  return (
    <VoucherForm
      key={`${type}:${preset.customerId ?? ""}:${preset.supplierId ?? ""}`}
      type={type}
      options={options}
      preset={preset}
      canChangeDate={can(user, `${perm}.changeDate`)}
      printSettings={printSettings}
    />
  );
}

// تعديل سند: نفس شاشة السند الجديد ومعاها السند
export async function VoucherEditContent({ params }) {
  const { user } = await getPageAccess();
  await connection();
  const { id } = await params;
  const voucherId = parseId(id);
  if (!voucherId) notFound();
  const voucher = await getVoucher(voucherId, user);
  if (!voucher) notFound();
  const perm = VOUCHER_PERM[voucher.type];
  if (!can(user, `${perm}.update`)) return <NoAccess />;
  const [options, printSettings] = await Promise.all([
    getVoucherOptions(user),
    getInvoicePrintSettings(),
  ]);
  return (
    <VoucherForm
      key={voucher.id}
      type={voucher.type}
      options={options}
      voucher={voucher}
      canChangeDate={can(user, `${perm}.changeDate`)}
      printSettings={printSettings}
    />
  );
}

export async function VoucherViewContent({ params, searchParams }) {
  const { user } = await getPageAccess();
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const voucherId = parseId(id);
  if (!voucherId) notFound();
  const voucher = await getVoucher(voucherId, user);
  if (!voucher) notFound();
  const perm = VOUCHER_PERM[voucher.type];
  if (!can(user, `${perm}.view`)) return <NoAccess />;
  const printSettings = await getInvoicePrintSettings();
  return (
    <VoucherDetails
      voucher={voucher}
      printSettings={printSettings}
      canCreate={voucher.type !== "offset" && can(user, `${perm}.create`)}
      canUpdate={voucher.type !== "offset" && can(user, `${perm}.update`)}
      canDelete={can(user, `${perm}.delete`)}
      autoPrint={sp?.print === "1"}
    />
  );
}
