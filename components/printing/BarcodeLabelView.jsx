"use client";
import BarcodeSvg from "./BarcodeSvg";

// المساحة القصوى لخطوط الباركود من ارتفاع الملصق حسب الحجم المختار
// (لو الملصق فيه عناصر أقل، الخطوط تكبر حتى هذا الحد تلقائياً)
const BARCODE_MAX = { small: "35%", normal: "50%", large: "65%" };

// ملصق باركود واحد بمقاسه الحقيقي بالمللي (للمعاينة وللطباعة)
// label: القالب، item: { name, code, price }، companyName: اسم الشركة
export default function BarcodeLabelView({ label, item, companyName, currency, onInvalidFormat }) {
  const pad = Math.max(1, Math.min(label.width, label.height) * 0.05); // هامش داخلي بالمللي

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
        <BarcodeSvg value={item.code} format={label.barcodeFormat} onInvalid={onInvalidFormat} />
      </div>

      {label.showCode && (
        <div
          className="barcode-label__code"
          style={{ fontSize: `${Math.max(4, Math.round(label.nameFontSize * 0.85))}pt` }}
        >
          {item.code}
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
