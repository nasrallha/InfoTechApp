"use client";

import { imageUrl } from "@/lib/image";
import { addressLine, documentInfo } from "@/lib/branch-info";
import { useCompany } from "@/components/common/CompanyProvider";
import "./a4-frame.css";

// ============================================================
// نموذج طباعة A4 (من إعدادات الطباعة) - كل المستندات A4 بتتلف فيه:
// الفواتير والتقارير والسندات ومستندات المخزن ...
// - classic: زي ما هو (كل مستند برأسه)
// - bilingual: رأس واحد: المؤسسة بالعربي يمين / الشعار في النص / بالإنجليزي شمال
// - letterhead: ورق مطبوع جاهز: من غير رأس، ومسافة فوق (الهيدر المطبوع)
//   وتحت (الفوتر المطبوع: التليفونات / العنوان / البنك ...) في كل صفحة،
//   وصورة الورقة خلفية في المعاينة والـ PDF بس (الطباعة على الورق من غيرها)
// company.a4 = { template, top, bottom, image } (من getCompany)
// ============================================================

// النموذج المختار
export function useA4(company) {
  const ctx = useCompany();
  const a4 = (company ?? ctx)?.a4;
  return a4?.template ? a4 : { template: "classic", top: 45, bottom: 0, image: null };
}

// side: هامش الجنبين في الطباعة (التقارير 10mm)
export default function A4Frame({ company, side = 0, children }) {
  const a4 = useA4(company);
  if (a4.template !== "letterhead") return children;
  const bottom = Math.max(a4.bottom, side);
  return (
    <div className="a4-frame a4-frame--letterhead">
      {/* الطباعة: الصفحة الأولى بالمسافة اللي تحت (المسافة دي)، والصفحات اللي بعدها
          بهامش الهيدر من فوق - والفوتر تحت في كل الصفحات */}
      <style>{`@page { margin: ${a4.top}mm ${side}mm ${bottom}mm ${side}mm; } @page :first { margin-top: 0; }`}</style>
      {a4.image && <img className="a4-frame__bg" src={imageUrl(a4.image)} alt="" />}
      <div style={{ height: `${a4.top}mm` }} />
      {children}
    </div>
  );
}

// السجل التجاري: من الفرع / الشركة، أو المعرّف لو نوعه سجل تجاري
const crOf = (company, info) =>
  info.registrationNo ||
  (company?.sellerIdScheme === "CRN" ? company?.sellerIdNumber : null) ||
  null;

// العنوان بالإنجليزي: الحقول الإنجليزي (لو موجودة) وإلا نفس العربي
function enAddress(company, address) {
  if (!address) return "";
  const branchAddr = address.city !== company?.city || address.street !== company?.street;
  const pick = (en, ar) => (branchAddr ? ar : en || ar);
  return [
    address.buildingNo,
    pick(company?.enStreet, address.street),
    pick(company?.enDistrict, address.district),
    pick(company?.enCity, address.city),
    address.postalCode,
    address.additionalNo && `Add. No ${address.additionalNo}`,
  ]
    .filter(Boolean)
    .join(", ");
}

// ============================================================
// رأس ثنائي اللغة: المؤسسة بالعربي (يمين) / الشعار / بالإنجليزي (شمال)
// الاسم + الرقم الضريبي + السجل التجاري + العنوان الوطني + الجوال
// ============================================================
export function BilingualHeader({ company, branch }) {
  if (!company) return null;
  const info = documentInfo(company, branch);
  const cr = crOf(company, info);
  const arAddress = addressLine(info.address, "رقم فرعي");
  const en = enAddress(company, info.address);
  return (
    <header className="bi-head">
      <div className="bi-head__side" dir="rtl">
        <div className="bi-head__name">{company.arName}</div>
        {info.taxNo && (
          <div>
            الرقم الضريبي: <bdi className="bi-head__num">{info.taxNo}</bdi>
          </div>
        )}
        {cr && (
          <div>
            السجل التجاري: <bdi className="bi-head__num">{cr}</bdi>
          </div>
        )}
        {arAddress && <div>{arAddress}</div>}
        {info.phone && (
          <div>
            الجوال: <bdi>{info.phone}</bdi>
          </div>
        )}
      </div>
      <div className="bi-head__logo">
        {info.logo && <img src={imageUrl(info.logo)} alt="" />}
      </div>
      <div className="bi-head__side" dir="ltr">
        <div className="bi-head__name">{company.enName || company.arName}</div>
        {info.taxNo && (
          <div>
            VAT No: <span className="bi-head__num">{info.taxNo}</span>
          </div>
        )}
        {cr && (
          <div>
            C.R: <span className="bi-head__num">{cr}</span>
          </div>
        )}
        {en && <div>{en}</div>}
        {info.phone && <div>Phone: {info.phone}</div>}
      </div>
    </header>
  );
}

// ============================================================
// بيانات العميل / المورد ثنائي اللغة: نفس القيم، التسميات عربي يمين وإنجليزي شمال
// rows: [[عربي, English, القيمة]] (كل السطور ظاهرة حتى لو القيمة فاضية)
// ============================================================
export function BilingualParty({ titleAr, titleEn, rows }) {
  const list = rows;
  return (
    <section className="bi-party">
      <div className="bi-party__title">
        <span>{titleAr}</span>
        <span dir="ltr">{titleEn}</span>
      </div>
      <div className="bi-party__grid">
        <div dir="rtl">
          {list.map(([ar, , v]) => (
            <div key={ar} className="bi-party__row">
              <span>{ar}:</span> <b>{v}</b>
            </div>
          ))}
        </div>
        <div dir="ltr">
          {list.map(([ar, en, v]) => (
            <div key={ar} className="bi-party__row">
              <span>{en}:</span> <b>{v}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
