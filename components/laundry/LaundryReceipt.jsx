"use client";

import { imageUrl } from "@/lib/image";
import { formatDateTime, formatDay } from "@/lib/dates";
import { documentInfo } from "@/lib/branch-info";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCompany } from "@/components/common/CompanyProvider";
import BarcodeSvg from "@/components/printing/BarcodeSvg";
import "./laundry-receipt.css";

// باركود الإيصال: LO + الرقم الفريد (المسح بيجيب الطلب من غير تاريخ)
export const orderBarcode = (id) => `LO${id}`;

// ============================================================
// إيصال استلام الملابس (كاشير 80/58mm أو A4)
// - رقم الطلب اليومي كبير + يومه (الرقم بيتكرر كل يوم)
// - القطع: العدد × القطعة - الخدمة (مستعجل) + الإضافات
// - الباركود تحت عشان التسليم بالمسح
// lang: "ar" | "en" | "both" (من إعدادات طباعة الفواتير)
// ============================================================
export default function LaundryReceipt({ order: o, paperSize, lang = "both" }) {
  const company = useCompany();
  const { amount: money, symbolNode: symbol } = useCurrency();
  const isA4 = paperSize === "A4";
  const dir = lang === "en" ? "ltr" : "rtl";
  const L = (ar, en) =>
    lang === "ar" ? ar : lang === "en" ? en : `${ar} / ${en}`;
  const nm = (x, ar = "arName", en = "enName") =>
    lang === "en" ? x[en] || x[ar] : x[ar] || x[en];
  const info = documentInfo(company, o.branch);
  const companyName = company
    ? lang === "en"
      ? company.enName
      : company.arName
    : "";

  return (
    <div
      className={`lrc ${isA4 ? "lrc--a4" : "lrc--thermal"}`}
      dir={dir}
      style={{ width: isA4 ? "210mm" : paperSize === "58mm" ? "48mm" : "72mm" }}
    >
      <header className="lrc__header">
        {company?.logo && (
          // مستند مطبوع: <img> عادية (next/image مش بتشتغل في الطباعة)
          // eslint-disable-next-line @next/next/no-img-element
          <img className="lrc__logo" src={imageUrl(company.logo)} alt="" />
        )}
        <div className="lrc__company">
          <div className="lrc__company-name">{companyName}</div>
          {o.branch && <div>{nm(o.branch)}</div>}
          {info.phone && (
            <div>
              <bdi>{info.phone}</bdi>
            </div>
          )}
        </div>
      </header>

      <div className="lrc__title">{L("إيصال استلام ملابس", "Laundry receipt")}</div>

      <div className="lrc__no">
        <span>{L("رقم الطلب", "Order No")}</span>
        <b>
          <bdi>{o.dailyNo}</bdi>
        </b>
        <span className="lrc__day">
          <bdi>{formatDay(o.bizDay)}</bdi>
        </span>
      </div>
      {o.isUrgent && <div className="lrc__urgent">{L("مستعجل", "URGENT")}</div>}

      <div className="lrc__meta">
        <div>
          <span>{L("العميل", "Customer")}</span>
          <b>{o.customerName}</b>
        </div>
        <div>
          <span>{L("الجوال", "Phone")}</span>
          <bdi>{o.phone}</bdi>
        </div>
        <div>
          <span>{L("وقت الاستلام", "Received at")}</span>
          <bdi>{formatDateTime(o.createdAt)}</bdi>
        </div>
      </div>

      <table className="lrc__items">
        <thead>
          <tr>
            <th>{L("العدد", "Qty")}</th>
            <th>{L("القطعة", "Item")}</th>
            <th>{L("الإجمالي", "Total")}</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id}>
              <td className="lrc__qty">{i.qty}</td>
              <td>
                <b>{nm(i)}</b> - {nm(i, "serviceArName", "serviceEnName")}
                {i.isUrgent && (
                  <span className="lrc__tag">{L("مستعجل", "Urgent")}</span>
                )}
                {(i.addons.length > 0 || i.notes) && (
                  <div className="lrc__addons">
                    {[...i.addons.map((a) => nm(a)), i.notes]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                )}
              </td>
              <td>
                <bdi>{money(i.total)}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="lrc__totals">
        <div>
          <span>{L("عدد القطع", "Pieces")}</span>
          <b>{o.totalQty}</b>
        </div>
        <div className="lrc__grand">
          <span>{L("الإجمالي", "Total")}</span>
          <b>
            <bdi>
              {money(o.totalAmount)} {symbol}
            </bdi>
          </b>
        </div>
      </div>

      {o.notes && (
        <div className="lrc__notes">
          <span>{L("ملاحظات", "Notes")}: </span>
          {o.notes}
        </div>
      )}

      <div className="lrc__barcode">
        <div className="lrc__barcode-svg">
          <BarcodeSvg value={orderBarcode(o.id)} />
        </div>
        <bdi>{orderBarcode(o.id)}</bdi>
      </div>

      <div className="lrc__footer">
        {L(
          "يرجى الاحتفاظ بهذا الإيصال لاستلام الملابس",
          "Please keep this receipt to collect your clothes",
        )}
      </div>
    </div>
  );
}
