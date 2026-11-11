// ============================================================
// ملفات الاستيراد في المتصفح (من غير سيرفر):
// - readSheet: قراءة xlsx / xls / csv ← العناوين + الصفوف (برقم الصف في الملف)
// - writeWorkbook: ملف Excel بسيط (النموذج / ملف الأخطاء) - العناوين في الصف الأول
// ============================================================
import { downloadBlob, safeName } from "./excel";

const filled = (c) => c !== null && c !== undefined && String(c).trim() !== "";

export async function readSheet(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", codepage: 65001 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws["!ref"]) return { headers: [], rows: [] };
  const start = XLSX.utils.decode_range(ws["!ref"]).s.r;
  const all = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
  // صف العناوين: أول صف فيه خانتين مليانين على الأقل
  const hi = all.findIndex((r) => (r ?? []).filter(filled).length >= 2);
  if (hi < 0) return { headers: [], rows: [] };
  const headers = all[hi].map((h) => (filled(h) ? String(h).trim() : ""));
  const rows = [];
  for (let i = hi + 1; i < all.length; i++) {
    const cells = all[i] ?? [];
    if (!cells.some(filled)) continue;
    // n: رقم الصف زي ما هو ظاهر في Excel
    rows.push({ n: start + i + 1, cells });
  }
  return { headers, rows };
}

// رقم تاريخ Excel (أيام من 1899-12-30) ← YYYY-MM-DD
export const excelSerialToDay = (n) =>
  new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000)
    .toISOString()
    .slice(0, 10);

// sheets: [{ name, rows: [[...]], widths?: [], header?: true }]
export async function writeWorkbook(fileName, sheets, rtl = true) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  for (const sh of sheets) {
    const ws = wb.addWorksheet(String(sh.name).slice(0, 31), {
      views: [{ rightToLeft: rtl, state: "frozen", ySplit: sh.header ? 1 : 0 }],
    });
    for (const r of sh.rows) ws.addRow(r);
    if (sh.header && ws.rowCount) {
      const head = ws.getRow(1);
      head.font = { bold: true };
      head.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    }
    (sh.widths ?? []).forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
    // الأعمدة النصية (الكود / الباركود / الجوال...): تنسيق نص عشان الأصفار اللي في الأول
    for (const i of sh.textCols ?? []) ws.getColumn(i + 1).numFmt = "@";
  }
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${safeName(fileName)}.xlsx`,
  );
}
