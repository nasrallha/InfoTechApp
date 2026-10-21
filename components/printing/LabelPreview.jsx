"use client";
import BarcodeLabelView from "./BarcodeLabelView";

// 1mm على الشاشة ≈ 3.78px
const PX_PER_MM = 96 / 25.4;

// معاينة الملصق مصغّرة/مكبّرة لتناسب مساحة معيّنة مع الحفاظ على شكله الحقيقي
// maxWidth, maxHeight: المساحة المتاحة بالبكسل
export default function LabelPreview({
  label,
  item,
  companyName,
  currency,
  maxWidth = 300,
  maxHeight = 240,
  onInvalidFormat,
}) {
  const w = label.width * PX_PER_MM;
  const h = label.height * PX_PER_MM;
  const scale = Math.min(maxWidth / w, maxHeight / h, 3);

  return (
    <div className="label-preview" style={{ width: w * scale, height: h * scale }}>
      <div
        style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: w, height: h }}
      >
        <BarcodeLabelView
          label={label}
          item={item}
          companyName={companyName}
          currency={currency}
          onInvalidFormat={onInvalidFormat}
        />
      </div>
    </div>
  );
}
