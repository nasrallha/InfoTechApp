"use client";
import { useTranslations } from "next-intl";
import { buildGs1 } from "@/lib/gs1";
import { formatDay } from "@/lib/dates";
import BarcodeSvg from "./BarcodeSvg";

// المساحة القصوى لخطوط الباركود من ارتفاع الملصق حسب الحجم المختار
// (لو الملصق فيه عناصر أقل، الخطوط تكبر حتى هذا الحد تلقائياً)
const BARCODE_MAX = { small: "35%", normal: "50%", large: "65%" };

// ملصق باركود واحد بمقاسه الحقيقي بالمللي (للمعاينة وللطباعة)
// label: القالب، item: { name, code, price, batch?, gs1?, showMfg?, showExp? }، companyName: اسم الشركة
// batch: ملصق دفعة (تتبع الصلاحية) ← تاريخ الإنتاج و/أو الانتهاء مكتوبين (حسب الاختيار)
//   gs1: الباركود نفسه GS1-128 (الصنف + التواريخ المختارة) بدل باركود الصنف العادي
export default function BarcodeLabelView({ label, item, companyName, currency, onInvalidFormat }) {
  const t = useTranslations("BarcodePrint");
  const pad = Math.max(1, Math.min(label.width, label.height) * 0.05); // هامش داخلي بالمللي
  // التواريخ المختارة للطباعة (الفاضي مش بيظهر)
  const mfg = item.batch && item.showMfg ? item.batch.mfgDate : null;
  const exp = item.batch && item.showExp ? item.batch.expDate : null;
  const gs =
    item.batch && item.gs1
      ? buildGs1({ gtin: item.code, mfgDate: mfg, expDate: exp })
      : null;
  const small = `${Math.max(4, Math.round(label.nameFontSize * 0.85))}pt`;

  return (
    <div
      className="barcode-label"
      style={{
        width: `${label.width}mm`,
        height: `${label.height}mm`,
        padding: `${pad}mm`,
      }}
    >
      {label.showCompany && companyName && (
        <div
          className="barcode-label__company"
          style={{ fontSize: `${Math.max(4, label.nameFontSize - 2)}pt` }}
        >
          {companyName}
        </div>
      )}

      {label.showName && (
        <div className="barcode-label__name" style={{ fontSize: `${label.nameFontSize}pt` }}>
          {item.name}
        </div>
      )}

      <div
        className="barcode-label__bars"
        style={{ maxHeight: BARCODE_MAX[label.barcodeSize] ?? "50%" }}
      >
        {gs ? (
          <BarcodeSvg value={gs.data} gs1 />
        ) : (
          <BarcodeSvg value={item.code} format={label.barcodeFormat} onInvalid={onInvalidFormat} />
        )}
      </div>

      {label.showCode && (
        <div
          className="barcode-label__code"
          style={{ fontSize: `${Math.max(4, Math.round(label.nameFontSize * 0.85))}pt` }}
        >
          {gs ? gs.text : item.code}
        </div>
      )}

      {/* التواريخ مكتوبة (في النوعين) */}
      {(mfg || exp) && (
        <div className="barcode-label__code" style={{ fontSize: small }}>
          {[
            mfg && `${t("MfgShort")}: ${formatDay(mfg)}`,
            exp && `${t("ExpShort")}: ${formatDay(exp)}`,
          ]
            .filter(Boolean)
            .join("  ")}
        </div>
      )}

      {label.showPrice && (
        <div className="barcode-label__price" style={{ fontSize: `${label.priceFontSize}pt` }}>
          {Number(item.price ?? 0).toFixed(2)} {currency}
        </div>
      )}
    </div>
  );
}
