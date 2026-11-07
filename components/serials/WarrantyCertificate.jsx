"use client";

import { useLocale } from "next-intl";
import { imageUrl } from "@/lib/image";
import { formatDateTime } from "@/lib/dates";
import { useCompany } from "@/components/common/CompanyProvider";

// ============================================================
// شهادة الضمان: نص أسود واضح (مايبهتش في الطباعة)
// paper: "A4" أو ورق الكاشير ("80mm" / "58mm")
// rows: [[العنوان، القيمة]]، signatures: [توقيع البائع، توقيع العميل]
// labels: { taxNo, phone, printedAt }
// ============================================================
const ink = "#000";
const THERMAL_WIDTH = { "80mm": 72, "58mm": 48 };

export default function WarrantyCertificate({
  title,
  rows,
  signatures = [],
  labels = {},
  paper = "A4",
}) {
  const locale = useLocale();
  const company = useCompany();
  const thermal = paper !== "A4";
  const dir = locale === "ar" ? "rtl" : "ltr";
  const companyName = company
    ? locale === "ar"
      ? company.arName || company.enName
      : company.enName || company.arName
    : "";

  // المقاسات: A4 كبيرة، والكاشير أصغر عشان تيجي على عرض الورقة
  const size = thermal
    ? {
        base: "9pt",
        company: "11pt",
        title: "13pt",
        logo: "14mm",
        cell: "1mm 1.5mm",
      }
    : {
        base: "13pt",
        company: "17pt",
        title: "22pt",
        logo: "18mm",
        cell: "2.5mm 3mm",
      };
  const border = `${thermal ? 1 : 1.5}px solid ${ink}`;

  return (
    <div
      dir={dir}
      style={{
        color: ink,
        fontFamily: "Tahoma, Arial, sans-serif",
        fontSize: size.base,
        lineHeight: 1.5,
        fontWeight: 600,
        padding: thermal ? 0 : "6mm",
        width: thermal ? `${THERMAL_WIDTH[paper] ?? 72}mm` : undefined,
        margin: thermal ? "0 auto" : undefined,
      }}
    >
      {/* المنشأة: في النص (الكاشير)، وجنب اللوجو (A4) */}
      <div
        style={{
          display: "flex",
          flexDirection: thermal ? "column" : "row",
          alignItems: "center",
          textAlign: thermal ? "center" : "start",
          gap: thermal ? "1mm" : "4mm",
          borderBottom: border,
          paddingBottom: thermal ? "1.5mm" : "3mm",
        }}
      >
        {company?.logo && (
          <img
            src={imageUrl(company.logo)}
            alt=""
            style={{ height: size.logo, width: "auto", objectFit: "contain" }}
          />
        )}
        <div>
          <div style={{ fontSize: size.company, fontWeight: 800 }}>
            {companyName}
          </div>
          {company?.taxNo && (
            <div>
              {labels.taxNo}: <bdi>{company.taxNo}</bdi>
            </div>
          )}
          {company?.phone && (
            <div>
              {labels.phone}: <bdi>{company.phone}</bdi>
            </div>
          )}
        </div>
      </div>

      {/* العنوان */}
      <div
        style={{
          textAlign: "center",
          fontSize: size.title,
          fontWeight: 800,
          margin: thermal ? "2mm 0" : "6mm 0 5mm",
        }}
      >
        {title}
      </div>

      {/* البيانات */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          color: ink,
          fontSize: size.base,
        }}
      >
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th
                style={{
                  width: thermal ? "38%" : "32%",
                  textAlign: "start",
                  verticalAlign: "top",
                  fontWeight: 800,
                  border,
                  padding: size.cell,
                  background: thermal ? "transparent" : "#e6e6e6",
                  WebkitPrintColorAdjust: "exact",
                  printColorAdjust: "exact",
                }}
              >
                {label}
              </th>
              <td
                style={{
                  border,
                  padding: size.cell,
                  fontWeight: 700,
                  overflowWrap: "anywhere",
                }}
              >
                <bdi>{value}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* التوقيعات */}
      {signatures.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: thermal ? "4mm" : "10mm",
            marginTop: thermal ? "6mm" : "18mm",
          }}
        >
          {signatures.map((s) => (
            <div
              key={s}
              style={{ flex: 1, textAlign: "center", fontWeight: 700 }}
            >
              {s}
              <div
                style={{
                  marginTop: thermal ? "8mm" : "16mm",
                  borderTop: border,
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: thermal ? "3mm" : "8mm",
          fontSize: thermal ? "8pt" : "10pt",
          textAlign: thermal ? "center" : "start",
        }}
      >
        {labels.printedAt}: <bdi>{formatDateTime(new Date())}</bdi>
      </div>
    </div>
  );
}
