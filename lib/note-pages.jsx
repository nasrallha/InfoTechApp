import "server-only";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/routing";
import { connection } from "next/server";
import { can } from "@/lib/permissions";
import { getPageAccess } from "@/lib/auth";
import {
  getPurchasePaymentMethods,
  parseId,
  parsePage,
} from "@/lib/purchase-pages";
import { parsePrintParam } from "@/lib/print-param";
import { getBranches } from "@/services/branch.service";
import {
  getNote,
  getNoteForEdit,
  getNoteInvoice,
  getNoteOptions,
  listNotes,
} from "@/services/note.service";
import { getCompany } from "@/services/company.service";
import { getInvoicePrintSettings } from "@/services/invoice-print.service";
import {
  getBranchZatcaInfo,
  isProductionLive,
} from "@/services/zatca-invoice.service";
import NotesList from "@/components/notes/NotesList";
import NoteForm from "@/components/notes/NoteForm";
import NoteDetails from "@/components/notes/NoteDetails";
import NoAccess from "@/components/common/NoAccess";

// ============================================================
// صفحات الإشعارات (العملاء: sale / الموردين: purchase)
// ============================================================
const PERM = { sale: "salesNotes", purchase: "purchaseNotes" };
const NOTE_PATH = { sale: "sales-notes", purchase: "purchase-notes" };
const NOTE_TYPES = ["credit", "debit"];
const typeOf = (v) => (NOTE_TYPES.includes(v) ? v : null);

// القائمة: ?type=credit|debit&q=&page=&branch=
export async function NotesListContent({ side, searchParams }) {
  const { user, allowed } = await getPageAccess(`${PERM[side]}.view`);
  if (!allowed) return <NoAccess />;

  await connection();
  const { q = "", page, branch, type } = await searchParams;
  const viewAll = can(user, "allBranches.view");
  const branchId = viewAll ? parseId(branch) : null;
  const query = String(q).slice(0, 100);
  const noteType = typeOf(type);
  const [data, branches] = await Promise.all([
    listNotes(
      side,
      { type: noteType, q: query, page: parsePage(page), branchId },
      user,
    ),
    viewAll ? getBranches() : null,
  ]);

  return (
    <NotesList
      side={side}
      data={data}
      q={query}
      type={noteType}
      branches={branches}
      branchId={branchId}
      canCreate={can(user, `${PERM[side]}.create`)}
    />
  );
}

// جديد: ?type=credit|debit&sale=ID (أو purchase=ID)
export async function NoteNewContent({ side, searchParams }) {
  const { user, allowed } = await getPageAccess(`${PERM[side]}.create`);
  if (!allowed) return <NoAccess />;

  await connection();
  const params = await searchParams;
  const invoiceId = parseId(params[side]);
  const [{ methods, creditMethod }, options, invoice, zatca] =
    await Promise.all([
      getPurchasePaymentMethods(),
      getNoteOptions(side, user),
      invoiceId ? getNoteInvoice(side, invoiceId, user) : null,
      side === "sale" ? getBranchZatcaInfo(user.branch.id) : null,
    ]);

  return (
    <NoteForm
      key={`${params.type ?? "credit"}-${invoiceId ?? "new"}`}
      side={side}
      initialType={typeOf(params.type) ?? "credit"}
      initialInvoice={invoice}
      methods={methods}
      creditMethod={creditMethod}
      options={options}
      zatcaActive={Boolean(zatca?.active)}
      canChangeDate={can(user, `${PERM[side]}.changeDate`)}
    />
  );
}

// التعديل: نفس شاشة الإشعار الجديد ومعاها الإشعار (قبل التوقيع للهيئة)
export async function NoteEditContent({ side, params }) {
  const { user, allowed } = await getPageAccess(`${PERM[side]}.update`);
  if (!allowed) return <NoAccess />;

  await connection();
  const { id } = await params;
  const noteId = parseId(id);
  if (!noteId) notFound();
  const note = await getNoteForEdit(side, noteId, user);
  if (!note) notFound();
  // مقفول (اتوقّع للهيئة / عليه سداد / الوردية اتقفلت) ← صفحة العرض
  if (note.locked)
    redirect({
      href: `/invoices/${NOTE_PATH[side]}/${noteId}`,
      locale: await getLocale(),
    });

  const [{ methods, creditMethod }, options, invoice, zatca] =
    await Promise.all([
      getPurchasePaymentMethods(),
      getNoteOptions(side, user),
      note.originalId
        ? getNoteInvoice(side, note.originalId, user, {
            excludeNoteId: note.id,
          })
        : null,
      side === "sale" ? getBranchZatcaInfo(user.branch.id) : null,
    ]);

  return (
    <NoteForm
      key={note.id}
      side={side}
      note={note}
      initialInvoice={invoice}
      methods={methods}
      creditMethod={creditMethod}
      options={options}
      zatcaActive={Boolean(zatca?.active)}
      canChangeDate={can(user, `${PERM[side]}.changeDate`)}
    />
  );
}

// العرض: ?print=1 ← يُطبع فور الفتح
export async function NoteViewContent({ side, params, searchParams }) {
  const { user, allowed } = await getPageAccess(`${PERM[side]}.view`);
  if (!allowed) return <NoAccess />;

  await connection();
  const [{ id }, { print }] = await Promise.all([params, searchParams]);
  const noteId = parseId(id);
  if (!noteId) notFound();

  const [note, company, printSettings] = await Promise.all([
    getNote(side, noteId, user),
    getCompany(),
    getInvoicePrintSettings(),
  ]);
  if (!note) notFound();
  const isSale = side === "sale";
  const [zatca, productionLive] = isSale
    ? await Promise.all([
        getBranchZatcaInfo(note.branch.id),
        isProductionLive(),
      ])
    : [null, false];

  return (
    <NoteDetails
      note={note}
      company={company}
      printSettings={printSettings}
      canCreate={can(user, `${PERM[side]}.create`)}
      canUpdate={can(user, `${PERM[side]}.update`)}
      canDelete={can(user, `${PERM[side]}.delete`)}
      productionLive={productionLive}
      autoPrint={parsePrintParam(print)}
      zatcaActive={Boolean(zatca?.active)}
      zatcaEnabled={
        isSale && (user.isOwner || !user.planBlocked?.includes("zatca.view"))
      }
      canZatcaSend={can(user, "zatca.send")}
      canZatcaExport={can(user, "zatca.export")}
    />
  );
}
