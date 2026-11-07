"use client";

import { useLocale } from "next-intl";
import { imageUrl } from "@/lib/image";
import { formatDateTime } from "@/lib/dates";
import { useCompany } from "@/components/common/CompanyProvider";
import { useCurrentUser } from "@/components/auth/AuthProvider";
import "./report.css";

// ============================================================
// تقرير/قائمة بشكل A4 للطباعة و PDF
// report = { title, info: [[label, value]], columns: [{title,key,type,align}],
//            rows, totals, totalLabel, summary: [[label, value, strong?]],
//            sections: [{ title, columns, rows, totals }], signatures: [label] }
// labels = { printedAt, printedBy, page }
// screenWidth: true = بعرض A4 الحقيقي (210mm) للمعاينة و PDF
// ============================================================
export default function ReportSheet({ report, labels, fixedWidth = true }) {
  const locale = useLocale();
  const company = useCompany();
  const user = useCurrentUser();
  const dir = locale === "ar" ? "rtl" : "ltr";
  const companyName = company
    ? locale === "ar"
      ? company.arName
      : company.enName
    : "";

  return (
    <div
      className="rep"
      dir={dir}
      // landscape: تقرير عريض بعرض A4 بالعرض
      style={
        fixedWidth
          ? { width: report.landscape ? "297mm" : "210mm", padding: "10mm" }
          : undefined
      }
    >
      <header className="rep__header">
        <div className="rep__company">
          {company?.logo && (
            <img className="rep__logo" src={imageUrl(company.logo)} alt="" />
          )}
          <div>
            <div className="rep__company-name">{companyName}</div>
            {company?.taxNo && (
              <div className="rep__muted">
                {labels.taxNo}: <bdi>{company.taxNo}</bdi>
              </div>
            )}
            {company?.phone && (
              <div className="rep__muted">
                <bdi>{company.phone}</bdi>
              </div>
            )}
          </div>
        </div>
        <div className="rep__title-box">
          <div className="rep__title">{report.title}</div>
          <div className="rep__muted">
            {labels.printedAt}: <bdi>{formatDateTime(new Date())}</bdi>
          </div>
          {user && (
            <div className="rep__muted">
              {labels.printedBy}:{" "}
              {locale === "ar" ? user.arFullname : user.enFullname}
            </div>
          )}
        </div>
      </header>

      {report.info?.length > 0 && (
        <div className="rep__info">
          {report.info.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <b>
                <bdi>{value}</bdi>
              </b>
            </div>
          ))}
        </div>
      )}

      {report.summary?.length > 0 && (
        <div className="rep__summary">
          {report.summary.map(([label, value, strong]) => (
            <div key={label} className={strong ? "rep__summary--strong" : ""}>
              <span>{label}</span>
              <b>
                <bdi>{value}</bdi>
              </b>
            </div>
          ))}
        </div>
      )}

      {report.columns && <SheetTable table={report} />}

      {report.sections?.map((s) => (
        <section key={s.title} className="rep__section">
          <h3>{s.title}</h3>
          <SheetTable table={s} />
        </section>
      ))}

      {report.signatures?.length > 0 && (
        <div className="rep__signatures">
          {report.signatures.map((s) => (
            <div key={s}>
              <span>{s}</span>
              <div className="rep__sign-line" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const fmt = (v, type) => {
  if (v == null || v === "") return "";
  if (type === "money") return Number(v).toFixed(2);
  if (type === "qty") return String(Number(Number(v).toFixed(3)));
  return v;
};

function SheetTable({ table }) {
  const { columns, rows, totals, totalLabel } = table;
  return (
    <table className="rep__table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>{c.title}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key ?? r.id ?? i}>
            {columns.map((c) => (
              <td
                key={c.key}
                className={c.type && c.type !== "text" ? "rep__num" : undefined}
              >
                <bdi>{fmt(r[c.key], c.type)}</bdi>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {totals && (
        <tfoot>
          <tr>
            {columns.map((c, i) => (
              <td
                key={c.key}
                className={c.type && c.type !== "text" ? "rep__num" : undefined}
              >
                <bdi>
                  {i === 0 && totals[c.key] == null
                    ? totalLabel
                    : fmt(totals[c.key], c.type)}
                </bdi>
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
