import { exportExcel } from "@/lib/excel";

// ============================================================
// تصدير المستخلص لـ Excel (نفس بيانات الطباعة: getCertificate)
// - البيانات فوق (العميل / العقد / رقم المستخلص عند العميل / الفاتورة)
// - البنود (بالكميات: التعاقدي والسابق والحالي والتراكمي) أو البنود الحرة
// - الملخص: الأعمال - الاسترداد = الخاضع + الضريبة = الفاتورة - الضمان - الغرامة = الصافي
// t: ترجمة Contracting | invoiceNo: رقم الفاتورة المعروض
// ============================================================
export async function exportCertificateExcel(x, t, { locale, invoiceNo } = {}) {
  const c = x.contract;
  const direct = Boolean(c.isDirect);
  const title = `${direct ? t("QuickCertificate") : t("Certificate")} ${t("No")} ${x.docNo}`;
  const info = [
    [c.kind === "sub" ? t("Subcontractor") : t("Owner"), c.party?.arName ?? ""],
    ...(direct ? [] : [[t("ContractNo"), c.docNo], [t("Project"), c.projectName]]),
    ...(x.clientRef ? [[t("ClientRef"), x.clientRef]] : []),
    [t("CertDate"), x.date],
    ...(invoiceNo ? [[t("InvoiceNo"), invoiceNo]] : []),
  ];
  const summary = [
    [t("WorksThisCert"), x.gross],
    ...(x.recovery > 0 ? [[t("AdvanceRecovery"), -x.recovery]] : []),
    [t("TaxableAmount"), x.gross - x.recovery],
    [`${t("Vat")} ${x.taxRate}%`, x.taxAmount],
    [t("InvoiceTotal"), x.invoiceTotal],
    ...(x.retention > 0 ? [[t("Retention"), -x.retention]] : []),
    ...(x.penalty > 0 ? [[t("DelayPenalty"), -x.penalty]] : []),
    [t("NetPayable"), x.netPayable, true],
  ];
  const qtyRows = x.rows.length > 0;
  const columns = qtyRows
    ? [
        { title: t("ItemNo"), key: "no", type: "text", width: 10 },
        { title: t("ItemDescription"), key: "description", type: "text", width: 40 },
        { title: t("Unit"), key: "unitName", type: "text", width: 10 },
        { title: t("ContractQty"), key: "contractQty", type: "qty" },
        { title: t("UnitPrice"), key: "price", type: "money" },
        { title: t("Previous"), key: "prevQty", type: "qty" },
        { title: t("Current"), key: "qty", type: "qty" },
        { title: t("Cumulative"), key: "totalQty", type: "qty" },
        { title: t("CurrentValue"), key: "amount", type: "money" },
        { title: t("CumulativeValue"), key: "totalAmount", type: "money" },
      ]
    : [
        { title: "#", key: "no", type: "text", width: 8 },
        { title: t("ItemDescription"), key: "description", type: "text", width: 45 },
        { title: t("Unit"), key: "unitName", type: "text", width: 12 },
        { title: t("Qty"), key: "qty", type: "qty" },
        { title: t("UnitPrice"), key: "price", type: "money" },
        { title: t("Amount"), key: "amount", type: "money" },
      ];
  const rows = qtyRows
    ? x.rows.map((r, i) => ({ key: i, no: r.itemNo || String(i + 1), ...r }))
    : x.extra.map((l, i) => ({ key: i, no: String(i + 1), ...l }));
  await exportExcel({
    title,
    fileName: `${title}${x.clientRef ? ` ${x.clientRef}` : ""}`,
    rtl: locale !== "en",
    info,
    summary,
    columns,
    rows,
  });
}
