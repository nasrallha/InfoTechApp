// ============================================================
// تصدير جدول إلى Excel (في المتصفح، بدون سيرفر)
// report = {
//   title, fileName, rtl,
//   info: [[label, value], ...]        ← سطور فوق الجدول (الفترة، الفرع ...)
//   columns: [{ title, key, type: "text"|"money"|"number"|"qty", width }],
//   rows: [{ key: value, ... }],
//   totals: { key: value } | null      ← سطر الإجمالي
//   summary: [[label, value]]           ← ملخص (تحت المعلومات)
//   sections: [ {title, columns, rows, totals} ]  ← كل قسم في شيت مستقل
// }
// ============================================================

const FORMATS = {
  money: "#,##0.00",
  number: "#,##0",
  qty: "#,##0.###",
};

function addSheet(wb, sheet, report) {
  // اسم الشيت: 31 حرف بحد أقصى، بدون رموز ممنوعة، وبدون تكرار
  const base = String(sheet.title || "Sheet")
    .replace(/[\\/*?:[\]]/g, "-")
    .slice(0, 28);
  let name = base;
  for (let i = 2; wb.getWorksheet(name); i++) name = `${base} ${i}`;
  const ws = wb.addWorksheet(name, {
    views: [{ rightToLeft: Boolean(report.rtl) }],
  });
  const cols = sheet.columns;
  ws.columns = cols.map((c) => ({
    key: c.key,
    width: c.width ?? (c.type === "text" || !c.type ? 24 : 15),
  }));

  // العنوان
  const titleRow = ws.addRow([sheet.title]);
  titleRow.font = { bold: true, size: 14 };
  ws.mergeCells(titleRow.number, 1, titleRow.number, Math.max(cols.length, 1));
  for (const [label, value] of [
    ...(sheet.info ?? []),
    ...(sheet.summary ?? []),
  ]) {
    const r = ws.addRow([label, value]);
    r.getCell(1).font = { bold: true };
  }
  ws.addRow([]);

  // رأس الجدول
  const head = ws.addRow(cols.map((c) => c.title));
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "thin" } };
  });

  // الصفوف
  for (const row of sheet.rows) {
    const r = ws.addRow(cols.map((c) => toCell(row[c.key], c.type)));
    cols.forEach((c, i) => {
      if (FORMATS[c.type]) r.getCell(i + 1).numFmt = FORMATS[c.type];
    });
  }

  // الإجمالي
  if (sheet.totals) {
    const r = ws.addRow(
      cols.map((c, i) =>
        i === 0 && sheet.totals[c.key] == null
          ? (sheet.totalLabel ?? "")
          : toCell(sheet.totals[c.key], c.type),
      ),
    );
    r.font = { bold: true };
    cols.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      if (FORMATS[c.type]) cell.numFmt = FORMATS[c.type];
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE7EEF7" },
      };
      cell.border = { top: { style: "thin" } };
    });
  }
}

function toCell(value, type) {
  if (value == null || value === "") return null;
  if (type && type !== "text") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  return String(value);
}

export async function exportExcel(report) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  if (report.columns) addSheet(wb, report, report);
  // الأقسام الإضافية (طرق الدفع، الكاشير ...): كل قسم في شيت
  (report.sections ?? []).forEach((extra, i) => {
    const first = i === 0 && !report.columns;
    addSheet(
      wb,
      {
        totalLabel: report.totalLabel,
        ...(first ? { info: report.info, summary: report.summary } : {}),
        ...extra,
      },
      report,
    );
  });
  // تقرير بدون جدول رئيسي: الملخص فقط في الشيت الأول
  if (!report.columns && !report.sections?.length) {
    addSheet(wb, { ...report, columns: [], rows: [] }, report);
  }
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${safeName(report.fileName || report.title)}.xlsx`);
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeName = (s) =>
  String(s || "file")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim()
    .slice(0, 100);
