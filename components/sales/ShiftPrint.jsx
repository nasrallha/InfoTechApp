"use client";

import { formatDateTime } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { PRINT_AREA } from "@/components/printing/invoice/InvoiceView";
import "@/components/printing/invoice/invoice.css";

const DENOMS = [500, 200, 100, 50, 20, 10, 5, 1];

// تقرير تسليم/استلام الوردية المطبوع (الكاشير 80mm أو A4) مع التوقيعات
export default function ShiftPrint({ shift, company, settings }) {
  const { amount: money, symbol } = useCurrency();
  const isA4 = settings.paperSize === "A4";
  const lang = settings.language;
  const L = (ar, en) =>
    lang === "ar" ? ar : lang === "en" ? en : `${ar} / ${en}`;
  const nm = (x) => (x ? (lang === "en" ? x.enName : x.arName) : "");
  const un = (u) => (u ? (lang === "en" ? u.enFullname : u.arFullname) : "");
  const s = shift.summary;
  const closed = shift.status === "closed";
  const row = (label, value, grand) => (
    <div key={label} className={grand ? "inv__grand" : undefined}>
      <span>{label}</span>
      <bdi>{value}</bdi>
    </div>
  );
  const section = (title) => (
    <div
      style={{
        marginTop: "3mm",
        fontWeight: 800,
        borderBottom: "1px solid #000",
      }}
    >
      {title}
    </div>
  );
  const signed = (v) => `${Number(v) > 0 ? "+" : ""}${money(v)}`;

  return (
    <div
      className={`inv ${isA4 ? "inv--a4" : "inv--thermal"}`}
      dir={lang === "en" ? "ltr" : "rtl"}
      style={{
        width: `${PRINT_AREA[settings.paperSize] ?? 72}mm`,
        padding: isA4 ? "12mm" : "3mm",
        fontSize: isA4 ? "10pt" : "8.5pt",
      }}
    >
      <header className="inv__header">
        <div className="inv__company-name">{company ? nm(company) : ""}</div>
        <div>{nm(shift.branch)}</div>
      </header>
      <div className="inv__title">
        {L("تقرير تسليم وردية", "Shift handover report")}{" "}
        <bdi>{formatDocNo("shift", shift.number)}</bdi>
      </div>
      <div className="inv__meta">
        {row(L("الكاشير", "Cashier"), un(shift.user))}
        {row(L("الفتح", "Opened"), formatDateTime(shift.openedAt))}
        {shift.closedAt &&
          row(L("القفل", "Closed"), formatDateTime(shift.closedAt))}
        {shift.closedBy && row(L("قفلها", "Closed by"), un(shift.closedBy))}
      </div>

      <div className="inv__totals">
        {section(L("المبيعات", "Sales"))}
        {row(
          `${L("المبيعات", "Sales")} (${s.salesCount})`,
          money(s.salesTotal),
        )}
        {row(
          `${L("المرتجعات", "Returns")} (${s.returnsCount})`,
          `-${money(s.returnsTotal)}`,
        )}
        {row(
          L("صافي المبيعات", "Net sales"),
          `${money(s.netTotal)} ${symbol}`,
          true,
        )}
        {row(L("الضريبة", "VAT"), money(s.taxTotal))}
        {s.methods.map((m) => (
          <div key={m.id}>
            <span>{nm(m)}</span>
            <bdi>{money(m.net)}</bdi>
          </div>
        ))}

        {section(L("حركة الدرج", "Drawer"))}
        {row(L("رصيد أول المدة", "Opening cash"), money(s.openingCash))}
        {shift.expectedOpening != null &&
          Number(shift.openingDifference) !== 0 &&
          row(
            L("فرق الاستلام", "Opening difference"),
            signed(shift.openingDifference),
          )}
        {row(L("صافي النقدي", "Cash sales net"), money(s.cashNet))}
        {s.receiptsCash > 0 &&
          row(
            L("سندات قبض نقدية", "Cash receipts"),
            `+${money(s.receiptsCash)}`,
          )}
        {s.paymentsCash > 0 &&
          row(
            L("سندات صرف نقدية", "Cash payments"),
            `-${money(s.paymentsCash)}`,
          )}
        {s.cashAdded > 0 &&
          row(L("إضافة للدرج", "Cash added"), `+${money(s.cashAdded)}`)}
        {s.cashWithdrawn > 0 &&
          row(
            L("سحب من الدرج", "Cash withdrawn"),
            `-${money(s.cashWithdrawn)}`,
          )}
        {row(
          L("النقدية المفروضة", "Expected cash"),
          money(closed ? shift.expectedCash : s.expectedCash),
          true,
        )}
        {closed &&
          row(L("الموجود فعلاً", "Counted cash"), money(shift.countedCash))}
        {closed && row(L("الفرق", "Difference"), signed(shift.difference))}

        {closed && shift.denominations && (
          <>
            {section(L("عدّ الفئات", "Denominations"))}
            {DENOMS.filter((d) => Number(shift.denominations[d]) > 0).map((d) =>
              row(
                `${d} × ${shift.denominations[d]}`,
                money(d * shift.denominations[d]),
              ),
            )}
            {Number(shift.denominations.coins) > 0 &&
              row(L("فكة", "Coins"), money(shift.denominations.coins))}
          </>
        )}

        {closed &&
          (shift.cardCounted != null || Number(shift.cardExpected) > 0) && (
            <>
              {section(L("الشبكة", "Card"))}
              {row(L("مبيعات الشبكة", "Card sales"), money(shift.cardExpected))}
              {row(
                L("إيصال تقفيل الجهاز", "Terminal total"),
                shift.cardCounted == null ? "—" : money(shift.cardCounted),
              )}
              {shift.cardDifference != null &&
                row(L("الفرق", "Difference"), signed(shift.cardDifference))}
            </>
          )}

        {closed && shift.leftCash != null && (
          <>
            {section(L("التسليم", "Handover"))}
            {row(
              L("المورّد للخزنة", "Deposited to safe"),
              money(shift.depositedCash),
            )}
            {row(
              L("المتروك في الدرج", "Left in drawer"),
              `${money(shift.leftCash)} ${symbol}`,
              true,
            )}
          </>
        )}
      </div>

      {s.movements?.length > 0 && (
        <div className="inv__totals">
          {section(L("السحب والإضافة", "Drawer in/out"))}
          {s.movements.map((m) => (
            <div key={m.id}>
              <span>
                {m.type === "out" ? L("سحب", "Out") : L("إضافة", "In")}
                {m.reason ? ` - ${m.reason}` : ""}
              </span>
              <bdi>{money(m.amount)}</bdi>
            </div>
          ))}
        </div>
      )}

      {shift.notes && <p className="inv__note">{shift.notes}</p>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "6mm",
          marginTop: "10mm",
          textAlign: "center",
        }}
      >
        <div>
          {L("المُسلِّم", "Handed over")}
          <div style={{ marginTop: "2mm" }}>{un(shift.user)}</div>
          <div style={{ borderTop: "1px solid #000", marginTop: "8mm" }} />
        </div>
        <div>
          {L("المستلِم", "Received by")}
          <div style={{ marginTop: "2mm" }}>&nbsp;</div>
          <div style={{ borderTop: "1px solid #000", marginTop: "8mm" }} />
        </div>
      </div>
    </div>
  );
}
