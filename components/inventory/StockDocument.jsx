"use client";

import { imageUrl } from "@/lib/image";
import "@/components/printing/invoice/invoice.css";

// ============================================================
// مستند مخزني مطبوع A4 (سند تحويل، محضر جرد)
// title: عنوان المستند، meta: [{ label, value }]
// columns: [{ title, render(row, index) }]، rows: الأصناف
// signatures: أسماء خانات التوقيع أسفل المستند
// ============================================================
export default function StockDocument({
  company,
  title,
  meta = [],
  columns = [],
  rows = [],
  signatures = [],
  dir = "rtl",
}) {
  return (
    <div
      className="inv inv--a4"
      dir={dir}
      style={{ width: "210mm", padding: "12mm", fontSize: "10pt" }}
    >
      <header className="inv__header">
        {company?.logo && (
          <img
            className="inv__logo"
            src={imageUrl(company.logo)}
            alt=""
            style={{ height: "20mm" }}
          />
        )}
        <div className="inv__company">
          <div className="inv__company-name">
            {dir === "rtl" ? company?.arName : company?.enName}
          </div>
        </div>
      </header>

      <div className="inv__title">{title}</div>

      <div className="inv__meta">
        {meta
          .filter((m) => m.value)
          .map((m) => (
            <div key={m.label}>
              <span>{m.label}</span>
              <span>{m.value}</span>
            </div>
          ))}
      </div>

      <table className="inv__items">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={c.name ? "inv__col-name" : undefined}>
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c, j) => (
                <td key={j} className={c.name ? "inv__col-name" : undefined}>
                  {c.render(r, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {signatures.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${signatures.length}, 1fr)`,
            gap: "10mm",
            marginTop: "18mm",
            textAlign: "center",
          }}
        >
          {signatures.map((s) => (
            <div key={s}>
              <div>{s}</div>
              <div style={{ borderTop: "1px solid #000", marginTop: "14mm" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
