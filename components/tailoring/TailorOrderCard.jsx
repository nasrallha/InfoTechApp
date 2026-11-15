"use client";

import { useEffect, useRef, useState } from "react";
import { CheckOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import PrintDocument from "@/components/printing/PrintDocument";
import PdfDocument from "@/components/printing/PdfDocument";
import { PRINT_AREA } from "@/components/printing/invoice/InvoiceView";
import { useCompany } from "@/components/common/CompanyProvider";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { formatDate, formatDay } from "@/lib/dates";
import { imageUrl } from "@/lib/image";
import { styleImageUrl } from "@/lib/tailoring";
import { thobeFromChoices } from "@/lib/thobe";
import ThobeFigure from "./ThobeFigure";
import "./tailoring.css";

const PX_PER_MM = 96 / 25.4;

// ============================================================
// كارت طلب التفصيل بشكل كارت الخياط الورقي:
// - فوق: المحل ورقم الطلب، والعميل والجوال والتاريخ والخياط
// - لكل شخص: خانات المقاسات كلها (المكتوب فيها والفاضية) + القماش
//   + كل رسومات التفاصيل (الموديل، الرقبة، الكبك ...) والمختار عليه علامة
// - تحت: عدد الثياب / القيمة / الواصل / الباقي / تاريخ التسليم
// order: من getTailorOrder، أو من شاشة الطلب قبل الحفظ (docNo فاضي)
// fields / groups: الخانات والتفاصيل الحالية (عشان كل الرسومات تظهر)
// onToggle(lineId, group, choiceId): الضغط على رسمة بيعلّم عليها (شاشة الطلب)
// ============================================================
export function TailorCardBody({
  order,
  fields = null,
  groups = null,
  onToggle = null,
}) {
  const t = useTranslations("Tailoring");
  const locale = useLocale();
  const company = useCompany();
  const { amount: money } = useCurrency();
  // السجل التجاري: المعرّف لو نوعه CRN، أو حقل السجل
  const crNo =
    company?.sellerIdScheme === "CRN" && company?.sellerIdNumber
      ? company.sellerIdNumber
      : company?.registrationNo;
  const nameOf = (x) =>
    x ? (locale === "ar" ? x.arName : x.enName || x.arName) : "";

  // المقاسات: كل الخانات (الفاضية كمان) زي الورقة
  const measuresOf = (l) => {
    if (!fields?.length) return l.measures;
    const byId = new Map(l.measures.map((m) => [m.id, m]));
    const all = fields.map((f) => ({
      ...f,
      value: byId.get(f.id)?.value ?? "",
    }));
    // خانة اتشالت من الإعدادات بس مكتوبة في الطلب
    return [
      ...all,
      ...l.measures.filter((m) => !fields.some((f) => f.id === m.id)),
    ];
  };

  // التفاصيل: كل رسومات المجموعة والمختار متعلّم عليه
  const stylesOf = (l) => {
    const chosen = new Map(l.styles.map((g) => [g.id, g]));
    if (!groups?.length)
      return l.styles.map((g) => ({
        ...g,
        choices: g.choices.map((c) => ({ ...c, on: true })),
      }));
    const rows = groups.map((g) => {
      const picked = chosen.get(g.id)?.choices ?? [];
      const ids = new Set(picked.map((c) => c.id));
      // اختيار اتشال من الإعدادات بس مختار في الطلب
      const extra = picked.filter((c) => !g.choices.some((x) => x.id === c.id));
      return {
        ...g,
        choices: [...g.choices, ...extra].map((c) => ({
          ...c,
          on: ids.has(c.id),
        })),
      };
    });
    const known = new Set(groups.map((g) => g.id));
    for (const g of l.styles)
      if (!known.has(g.id))
        rows.push({
          ...g,
          choices: g.choices.map((c) => ({ ...c, on: true })),
        });
    return rows;
  };

  return (
    <div className="tailor-card" dir={locale === "ar" ? "rtl" : "ltr"}>
      {/* رأس الكارت: المؤسسة بالعربي (يمين) والإنجليزي (شمال) + الرقم الضريبي
          والسجل التجاري باللغتين، وفي النص الشعار والعنوان ورقم الطلب */}
      <div className="tailor-card__head">
        <div className="tailor-card__org" dir="rtl">
          <div className="tailor-card__org-name">{company?.arName}</div>
          {company?.taxNo && (
            <div>
              الرقم الضريبي: <bdi>{company.taxNo}</bdi>
            </div>
          )}
          {crNo && (
            <div>
              السجل التجاري: <bdi>{crNo}</bdi>
            </div>
          )}
        </div>
        <div className="tailor-card__center">
          {company?.logo && <img src={imageUrl(company.logo)} alt="" />}
          <div className="tailor-card__title">{t("OrderCard")}</div>
          <div className="tailor-card__no">
            <bdi>{order.docNo ?? "—"}</bdi>
          </div>
        </div>
        <div className="tailor-card__org" dir="ltr">
          <div className="tailor-card__org-name">
            {company?.enName || company?.arName}
          </div>
          {company?.taxNo && <div>VAT No: {company.taxNo}</div>}
          {crNo && <div>C.R. No: {crNo}</div>}
        </div>
      </div>

      <table className="tailor-card__grid">
        <tbody>
          <tr>
            <th>{t("Customer")}</th>
            <td>{nameOf(order.customer) || "—"}</td>
            <th>{t("Phone")}</th>
            <td>
              <bdi>{order.customer?.phone ?? "—"}</bdi>
            </td>
          </tr>
          <tr>
            <th>{t("OrderDate")}</th>
            <td>
              <bdi>{formatDate(order.orderDate)}</bdi>
            </td>
            <th>{t("Tailor")}</th>
            <td>{order.technician ? nameOf(order.technician) : "—"}</td>
          </tr>
          <tr>
            <th>{t("Persons")}</th>
            <td colSpan={3}>
              {order.lines
                .map(
                  (l) => `${l.personName} (${t("PiecesN", { n: l.pieces })})`,
                )
                .join(" ، ")}
            </td>
          </tr>
        </tbody>
      </table>

      {order.lines.map((l) => {
        const measures = measuresOf(l);
        return (
          <div key={l.id} className="tailor-card__person">
            <div className="tailor-card__person-name">
              <span>
                {t("Person")}: {l.personName}
              </span>
              <span>{t("PiecesN", { n: l.pieces })}</span>
            </div>
            {/* الشخص: الثوب كبير على جنب، والمقاسات والقماش والرسومات جنبه */}
            <div className="tailor-card__person-body">
              <div className="tailor-card__thobe">
                <ThobeFigure
                  thobe={thobeFromChoices(
                    stylesOf(l).flatMap((g) => g.choices.filter((c) => c.on)),
                  )}
                  width="100%"
                />
              </div>
              <div className="tailor-card__person-main">
                {/* المقاسات في صف واحد + نوع القماش في الآخر (زي الورقة) */}
                <table className="tailor-card__measures">
                  <thead>
                    <tr>
                      {measures.map((m) => (
                        <th key={m.id}>{nameOf(m)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {measures.map((m) => (
                        <td key={m.id} className="tailor-card__value">
                          <bdi>{m.value}</bdi>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                <table>
                  <tbody>
                    <tr>
                      <th className="tailor-card__fabric-head">
                        {t("FabricType")}
                      </th>
                      <td className="tailor-card__fabric">
                        {l.fabricName ? `${l.fabricName} (${l.fabricQty})` : ""}
                      </td>
                    </tr>
                    {l.notes && (
                      <tr>
                        <th>{t("Notes")}</th>
                        <td>{l.notes}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {/* الرسومات: كل مجموعة في مربع، وتحت كل رسمة مربع العلامة ☐ / ☑ */}
                <div className="tailor-card__blocks">
                  {stylesOf(l).map((g) => (
                    <div key={g.id} className="tailor-card__block">
                      <div className="tailor-card__block-name">{nameOf(g)}</div>
                      <div className="tailor-card__styles">
                        {g.choices.map((c) => (
                          <div
                            key={c.id}
                            className={`tailor-card__style${c.on ? " tailor-card__style--on" : ""}${onToggle ? " tailor-card__style--click" : ""}`}
                            onClick={
                              onToggle
                                ? () => onToggle(l.id, g, c.id)
                                : undefined
                            }
                            role={onToggle ? "button" : undefined}
                          >
                            {c.image ? (
                              <img src={styleImageUrl(c.image)} alt="" />
                            ) : (
                              <div className="tailor-card__noimg" />
                            )}
                            <div className="tailor-card__choice">
                              <span
                                className={`tailor-card__box${c.on ? " tailor-card__box--on" : ""}`}
                              >
                                {c.on && <CheckOutlined />}
                              </span>
                              <span>{nameOf(c)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {order.notes && (
        <p>
          <b>{t("Notes")}:</b> {order.notes}
        </p>
      )}

      {/* زي آخر صف في الكارت الورقي */}
      <table className="tailor-card__totals">
        <thead>
          <tr>
            <th>{t("Pieces")}</th>
            {order.discount > 0 && <th>{t("Discount")}</th>}
            <th>{t("Total")}</th>
            <th>{t("Paid")}</th>
            <th>{t("Due")}</th>
            <th>{t("DeliveryDate")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{order.pieces}</td>
            {order.discount > 0 && <td>{money(order.discount)}</td>}
            <td>{money(order.total)}</td>
            <td>{money(order.paid)}</td>
            <td>{money(order.due)}</td>
            <td>
              <bdi>{formatDay(order.deliveryDate)}</bdi>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// الكارت مرسوم في الشاشة (مصغّر على قد المكان) - بيتحدث مع كل اختيار
export function LiveTailorCard(props) {
  // الكارت كله قدامك من غير سكرول: بيصغر على قد عرض المكان وطول الشاشة
  // (الأصغر من الاتنين) ويفضل في نص المكان
  const box = useRef(null);
  const inner = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0, room: 0 });
  const widthPx = Math.round(PRINT_AREA.A4 * PX_PER_MM);
  useEffect(() => {
    const el = box.current;
    const card = inner.current;
    if (!el || !card) return;
    const update = () =>
      setSize({
        w: el.clientWidth,
        h: card.offsetHeight,
        // الطول المتاح: من مكان الكارت لحد آخر الشاشة (والمكان ثابت وإنت بتنزل)
        // طول الشاشة (العمود ثابت فوق) - سطر التلميح والهوامش
        room: Math.max(320, window.innerHeight - 50),
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    observer.observe(card);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  // مالي عرض المكان كله (نص الصفحة)
  // الكارت كله قدامك من غير سكرول: على قد عرض المكان وطول الشاشة (الأصغر)
  const scale =
    size.w && size.h ? Math.min(size.w / widthPx, size.room / size.h) : 0;
  return (
    <div ref={box} className="tailor-live">
      <div
        style={{
          width: widthPx * scale,
          height: size.h * scale,
          margin: "0 auto",
          position: "relative",
          overflow: "hidden",
          visibility: scale ? "visible" : "hidden",
        }}
      >
        <div
          ref={inner}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: widthPx,
            transform: `scale(${scale || 1})`,
            transformOrigin: "top left",
          }}
        >
          <TailorCardBody {...props} />
        </div>
      </div>
    </div>
  );
}

// الطباعة أو PDF: نفس الكارت على ورقة A4 (نفس شكل الشاشة بالظبط)
// pdf: تنزيل ملف بدل نافذة الطباعة
export default function TailorOrderCard({
  order,
  fields,
  groups,
  onDone,
  pdf = false,
}) {
  // قبل الطباعة: الكارت بيترسم برّه الشاشة بعرض A4، ونستنى كل الرسومات تحمّل،
  // ولو أطول من ورقة A4 بيصغر على قدها (نفس شكل المعاينة في صفحة واحدة)
  const probe = useRef(null);
  const [zoom, setZoom] = useState(null);
  useEffect(() => {
    const el = probe.current;
    if (!el) return;
    let alive = true;
    const imgs = [...el.querySelectorAll("img")];
    Promise.all(
      imgs.map((img) =>
        img.complete
          ? null
          : new Promise((r) => {
              img.onload = r;
              img.onerror = r;
            }),
      ),
    ).then(() => {
      if (!alive) return;
      const maxPx = 296 * PX_PER_MM;
      const h = el.offsetHeight;
      setZoom(h > maxPx ? maxPx / h : 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  // عرض ورقة A4 ثابت (منطقة الطباعة من غير عرض ← الكارت كان بيضيق على قد كلامه)
  const sheet = (style) => (
    <div
      style={{
        width: "210mm",
        padding: "5mm",
        boxSizing: "border-box",
        ...style,
      }}
    >
      <TailorCardBody order={order} fields={fields} groups={groups} />
    </div>
  );

  if (zoom == null)
    return (
      <div
        ref={probe}
        style={{
          position: "fixed",
          top: 0,
          left: -10000,
          visibility: "hidden",
        }}
      >
        {sheet()}
      </div>
    );
  // ورقة A4 ثابتة (صفحة واحدة بالظبط في الطباعة والـ PDF): الكارت جواها في النص،
  // ولو أطول بيصغر من فوق في النص (scale مش zoom: مقاس الورقة مبيتغيرش)
  const body = (
    <div
      style={{
        width: "210mm",
        height: "296mm",
        overflow: "hidden",
        position: "relative",
        background: "var(--c-surface)",
      }}
    >
      {sheet({
        position: "absolute",
        top: 0,
        left: 0,
        transform: zoom < 1 ? `scale(${zoom})` : undefined,
        transformOrigin: "top center",
      })}
    </div>
  );
  return pdf ? (
    <PdfDocument
      paperSize="A4"
      fileName={`${order.docNo ?? "order"}.pdf`}
      onDone={onDone}
    >
      {body}
    </PdfDocument>
  ) : (
    <PrintDocument paperSize="A4" onDone={onDone}>
      {body}
    </PrintDocument>
  );
}
