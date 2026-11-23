"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCompany } from "@/components/common/CompanyProvider";
import A4Frame, { BilingualHeader, useA4 } from "@/components/printing/A4Frame";
import { formatDay } from "@/lib/dates";
import { imageUrl } from "@/lib/image";
import { qtyText } from "@/lib/unit-qty";
import { saleDocNo, purchaseDocNo } from "@/lib/doc-number";
import "./contracting-print.css";

// ============================================================
// رأس مستندات المقاولات حسب نموذج A4 (الحالي / ثنائي اللغة / الورق الجاهز من غير رأس)
// ============================================================
export function ContractingHead({ title, sub }) {
  const company = useCompany();
  const tpl = useA4(company).template;
  return (
    <>
      {tpl === "bilingual" && <BilingualHeader company={company} />}
      {tpl === "classic" && (
        <header className="ctp__head">
          <div className="ctp__company">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {company?.logo && <img src={imageUrl(company.logo)} alt="" />}
            <div>
              <div className="ctp__company-name">{company?.arName}</div>
              {company?.enName && <div dir="ltr">{company.enName}</div>}
            </div>
          </div>
          <div className="ctp__title">
            {title}
            {sub && <small>{sub}</small>}
          </div>
        </header>
      )}
      {tpl !== "classic" && (
        <div className="ctp__title" style={{ marginBottom: "3mm" }}>
          {title}
          {sub && <small>{sub}</small>}
        </div>
      )}
    </>
  );
}

// ============================================================
// طباعة المستخلص (A4)
// - بالكميات: كل بنود المقايسة (التعاقدي / السابق / الحالي / التراكمي / نسبة الإنجاز)
// - البنود الحرة (أعمال إضافية / المبلغ الإجمالي)
// - الملخص: الأعمال - استرداد الدفعة المقدمة + الضريبة = الفاتورة - الضمان - الغرامة = الصافي
// - التوقيعات: المقاول / الاستشاري / المالك
// cert: من getCertificate
// ============================================================
export default function CertificatePrint({ cert: x }) {
  const t = useTranslations("Contracting");
  const { amount: money } = useCurrency();
  const locale = useLocale();
  const c = x.contract;
  const sub = c.kind === "sub";
  // المستخلص السريع (من غير عقد): من غير رقم عقد ولا مشروع ولا الموقف التراكمي
  const direct = Boolean(c.isDirect);
  const invoiceNo = x.invoice
    ? sub
      ? purchaseDocNo(x.invoice.type, x.invoice.number, x.invoice.docCode)
      : saleDocNo(x.invoice.type, x.invoice.number, x.invoice.docCode)
    : null;
  const sumRows = (key) => x.rows.reduce((s, r) => s + r[key], 0);
  const pctOf = (r) => (r.contractQty > 0 ? Math.min(100, Math.round((r.totalQty / r.contractQty) * 1000) / 10) : 0);
  // ضريبة الاسترداد (للعرض: الأعمال × الضريبة - الاسترداد × الضريبة = ضريبة الفاتورة)
  const recoveryTax = Math.max(0, Math.round(((x.gross * x.taxRate) / 100 - x.taxAmount) * 100) / 100);

  const summary = [
    [t("WorksThisCert"), money(x.gross)],
    x.recovery > 0 && [t("AdvanceRecovery"), `- ${money(x.recovery)}`, "minus"],
    [t("TaxableAmount"), money(x.gross - x.recovery)],
    [`${t("Vat")} ${x.taxRate}%`, money(x.taxAmount)],
    recoveryTax > 0 && [t("RecoveryTaxNote"), money(recoveryTax), "note"],
    [t("InvoiceTotal"), money(x.invoiceTotal)],
    x.retention > 0 && [
      c.retentionPct ? `${t("Retention")} ${c.retentionPct}%` : t("Retention"),
      `- ${money(x.retention)}`,
      "minus",
    ],
    x.penalty > 0 && [t("DelayPenalty"), `- ${money(x.penalty)}`, "minus"],
    [t("NetPayable"), money(x.netPayable), "net"],
    // الختامي: الإفراج عن الضمان المحجوز من المستخلصات السابقة
    x.release && [t("RetentionReleased"), money(x.release.amount)],
    x.release && [t("TotalWithRelease"), money(x.netPayable + x.release.amount), "net"],
  ].filter(Boolean);

  // طريقة السداد: المدفوع على الفاتورة بطرقه + الآجل + الإفراج عن الضمان
  const nmOf = (m) => (locale === "en" ? m.enName || m.arName : m.arName);
  const paidRows = [
    ...(x.invoice?.payments ?? []).map((p) => [nmOf(p), money(p.amount)]),
    x.invoice?.credit > 0 && [t("OnCredit"), money(x.invoice.credit)],
    x.retention > 0 && [t("RetentionHeldOnInvoice"), money(x.retention)],
    x.release && [`${t("RetentionReleased")}${nmOf(x.release) ? ` (${nmOf(x.release)})` : ""}`, money(x.release.amount)],
  ].filter(Boolean);

  const cumulative = [
    [t("PreviousWorks"), money(x.previous.gross)],
    [t("WorksThisCert"), money(x.gross)],
    [t("CumulativeWorks"), money(x.previous.gross + x.gross)],
    // العقد المختصر من غير قيمة: من غير قيمة العقد ونسبة الإنجاز
    c.totalAmount > 0 && [t("ContractValue"), money(c.totalAmount)],
    c.totalAmount > 0 && [t("Progress"), `${Math.round(((x.previous.gross + x.gross) / c.totalAmount) * 1000) / 10}%`],
    [t("CumulativeRecovery"), money(x.previous.recovery + x.recovery)],
    [t("CumulativeRetention"), money(x.previous.retention + x.retention)],
  ].filter(Boolean);

  return (
    <A4Frame>
      <div className="ctp" dir="rtl">
        <ContractingHead
          title={
            direct
              ? `${t("QuickCertificate")} ${t("No")} ${x.docNo}`
              : `${t("Certificate")} ${t("No")} ${x.docNo}${x.isFinal ? ` (${t("Final")})` : ""}`
          }
          sub={x.cancelled ? t("CertCancelledTag") : sub ? t("SubCertificate") : null}
        />
        <div className="ctp__info">
          {!direct && (
            <div>
              <span>{t("ContractNo")}:</span> <bdi>{c.docNo}</bdi>
              {c.refNo ? (
                <>
                  {" "}
                  (<bdi>{c.refNo}</bdi>)
                </>
              ) : null}
            </div>
          )}
          {!direct && (
            <div>
              <span>{t("Project")}:</span> {c.projectName}
            </div>
          )}
          {/* ترتيبه في العقد (المستخلص الأول / التاني ...) */}
          {!direct && (
            <div>
              <span>{t("SeqInContract")}:</span> {x.seq}
            </div>
          )}
          {x.clientRef && (
            <div>
              <span>{t("ClientRef")}:</span> <bdi>{x.clientRef}</bdi>
            </div>
          )}
          <div>
            <span>{sub ? t("Subcontractor") : t("Owner")}:</span> {c.party?.arName}
          </div>
          <div>
            <span>{t("CertDate")}:</span> <bdi>{formatDay(x.date)}</bdi>
          </div>
          {!direct && (
            <div>
              <span>{t("Period")}:</span>{" "}
              {x.periodFrom && x.periodTo ? (
                <bdi>
                  {formatDay(x.periodFrom)} - {formatDay(x.periodTo)}
                </bdi>
              ) : (
                "—"
              )}
            </div>
          )}
          <div>
            <span>{t("InvoiceNo")}:</span> {invoiceNo ? <bdi>{invoiceNo}</bdi> : "—"}
          </div>
          {c.projectLocation && (
            <div>
              <span>{t("ProjectLocation")}:</span> {c.projectLocation}
            </div>
          )}
          {c.party?.taxNo && (
            <div>
              <span>{t("PartyVat")}:</span> <bdi>{c.party.taxNo}</bdi>
            </div>
          )}
        </div>

        {/* بنود المقايسة */}
        {x.rows.length > 0 && (
          <table style={{ fontSize: "7.5pt" }}>
            <thead>
              <tr className="ctp__group">
                <th colSpan={3} />
                <th colSpan={2}>{t("Contractual")}</th>
                <th colSpan={3}>{t("Quantities")}</th>
                <th />
                <th colSpan={2}>{t("Values")}</th>
              </tr>
              <tr>
                <th style={{ width: "8mm" }}>{t("ItemNo")}</th>
                <th>{t("ItemDescription")}</th>
                <th style={{ width: "10mm" }}>{t("Unit")}</th>
                <th>{t("Qty")}</th>
                <th>{t("UnitPrice")}</th>
                <th>{t("Previous")}</th>
                <th>{t("Current")}</th>
                <th>{t("Cumulative")}</th>
                <th style={{ width: "10mm" }}>%</th>
                <th>{t("CurrentValue")}</th>
                <th>{t("CumulativeValue")}</th>
              </tr>
            </thead>
            <tbody>
              {x.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.itemNo || i + 1}</td>
                  <td className="ctp__desc">{r.description}</td>
                  <td>{r.unitName}</td>
                  <td className="ctp__num">{qtyText(r.contractQty)}</td>
                  <td className="ctp__num">{money(r.price)}</td>
                  <td className="ctp__num">{qtyText(r.prevQty)}</td>
                  <td className="ctp__num">
                    <b>{qtyText(r.qty)}</b>
                  </td>
                  <td className="ctp__num">{qtyText(r.totalQty)}</td>
                  <td>{pctOf(r)}</td>
                  <td className="ctp__num">
                    <b>{money(r.amount)}</b>
                  </td>
                  <td className="ctp__num">{money(r.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={9}>{t("Total")}</td>
                <td className="ctp__num">{money(sumRows("amount"))}</td>
                <td className="ctp__num">{money(sumRows("totalAmount"))}</td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* البنود الحرة / المبلغ الإجمالي */}
        {x.extra.length > 0 && (
          <table>
            <thead>
              <tr>
                <th style={{ width: "8mm" }}>#</th>
                <th>{x.mode === "lump" ? t("WorkDescription") : t("ExtraWorks")}</th>
                <th style={{ width: "14mm" }}>{t("Unit")}</th>
                <th style={{ width: "18mm" }}>{t("Qty")}</th>
                <th style={{ width: "26mm" }}>{t("UnitPrice")}</th>
                <th style={{ width: "28mm" }}>{t("Amount")}</th>
              </tr>
            </thead>
            <tbody>
              {x.extra.map((l, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="ctp__desc">{l.description}</td>
                  <td>{l.unitName}</td>
                  <td className="ctp__num">{qtyText(l.qty)}</td>
                  <td className="ctp__num">{money(l.price)}</td>
                  <td className="ctp__num">
                    <b>{money(l.amount)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="ctp__bottom">
          <table className="ctp__sum">
            <thead>
              <tr>
                <th colSpan={2}>{t("CertSummary")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(([label, v, cls]) => (
                <tr key={label} className={cls === "minus" ? "ctp__minus" : cls === "net" ? "ctp__net" : undefined}>
                  <td className={cls === "note" ? "ctp__note" : undefined}>{label}</td>
                  <td className={cls === "note" ? "ctp__note" : undefined}>
                    <bdi>{v}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!direct && (
          <table className="ctp__sum">
            <thead>
              <tr>
                <th colSpan={2}>{t("CumulativePosition")}</th>
              </tr>
            </thead>
            <tbody>
              {cumulative.map(([label, v]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>
                    <bdi>{v}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>

        {/* طريقة السداد */}
        {paidRows.length > 0 && (
          <div className="ctp__bottom">
            <table className="ctp__sum">
              <thead>
                <tr>
                  <th colSpan={2}>{t("PaymentDetails")}</th>
                </tr>
              </thead>
              <tbody>
                {paidRows.map(([label, v], i) => (
                  <tr key={`${label}-${i}`}>
                    <td>{label}</td>
                    <td>
                      <bdi>{v}</bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {x.notes && (
          <div style={{ marginTop: "2mm" }}>
            <b>{t("Notes")}:</b> {x.notes}
          </div>
        )}

        <div className="ctp__signs">
          <div>{sub ? t("Subcontractor") : t("Contractor")}</div>
          {!direct && <div>{sub ? t("ProjectEngineer") : t("Consultant")}</div>}
          <div>{sub ? t("MainContractor") : t("Owner")}</div>
        </div>
      </div>
    </A4Frame>
  );
}
