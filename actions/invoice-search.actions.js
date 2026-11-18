"use server";

// البحث عن فاتورة من جوه شاشة الإنشاء (بيع / مرتجع بيع / شراء / مرتجع شراء / عرض سعر)
// الشاشات بتفتح على الإنشاء على طول، والقايمة بتظهر بس لما المستخدم يبحث

import { z } from "zod";
import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { listSales, SALE, SALE_RETURN } from "@/services/sale.service";
import { listPurchases, PURCHASE, PURCHASE_RETURN } from "@/services/purchase.service";
import { listQuotations } from "@/services/quotation.service";
import { saleDocNo, purchaseDocNo, saleDocHref, purchaseDocHref, formatDocNo } from "@/lib/doc-number";

const KINDS = {
  sale: { side: "sale", type: SALE, view: "sales.view", update: "sales.update" },
  saleReturn: { side: "sale", type: SALE_RETURN, view: "salesReturns.view" },
  purchase: { side: "purchase", type: PURCHASE, view: "purchases.view", update: "purchases.update" },
  purchaseReturn: { side: "purchase", type: PURCHASE_RETURN, view: "purchaseReturns.view" },
  quotation: { side: "quotation", type: null, view: "quotations.view", update: "quotations.update" },
};

const schema = z.object({
  kind: z.enum(Object.keys(KINDS)),
  q: z.string().trim().min(1).max(100),
  page: z.number().int().min(1).max(1000).default(1),
});

export async function searchInvoicesAction(input) {
  return runAction(schema, input, async (d, user) => {
    const k = KINDS[d.kind];
    if (!can(user, k.view)) throw new AppError("Forbidden");
    // عروض الأسعار: التعديل للمفتوح بس (اللي اتحول لفاتورة مقفول)
    if (k.side === "quotation") {
      const res = await listQuotations({ q: d.q, page: d.page, pageSize: 10, user });
      const canEdit = can(user, k.update);
      return {
        total: res.total,
        rows: res.rows.map((r) => ({
          id: r.id,
          docNo: formatDocNo("quotation", r.number, r.docCode),
          date: r.date,
          arName: r.customerArName,
          enName: r.customerEnName,
          total: Number(r.totalAmount ?? 0),
          remaining: 0,
          href: `/invoices/quotations/${r.id}`,
          editHref: canEdit && r.status === "open" ? `/invoices/quotations/${r.id}/edit` : null,
        })),
      };
    }
    const sale = k.side === "sale";
    const list = sale ? listSales : listPurchases;
    const res = await list({ type: k.type, q: d.q, page: d.page, pageSize: 10, user, branchId: null });
    const canEdit = Boolean(k.update && can(user, k.update));
    return {
      total: res.total,
      rows: res.rows.map((r) => {
        const href = sale ? saleDocHref(r.type ?? k.type, r.id) : purchaseDocHref(k.type, r.id);
        return {
          id: r.id,
          docNo: sale ? saleDocNo(r.type ?? k.type, r.number, r.docCode) : purchaseDocNo(k.type, r.number, r.docCode),
          date: r.date,
          arName: sale ? r.customerArName : r.supplierArName,
          enName: sale ? r.customerEnName : r.supplierEnName,
          total: Number(r.totalAmount ?? 0),
          remaining: Number(r.remainingAmount ?? 0),
          href,
          editHref: canEdit ? `${href}/edit` : null,
        };
      }),
    };
  });
}
