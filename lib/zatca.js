// ============================================================
// QR الزكاة (ZATCA) للفاتورة المبسطة - المرحلة الأولى
// المحتوى = 5 حقول بصيغة TLV (رقم الحقل + طوله + قيمته) ثم Base64:
//   1 اسم البائع، 2 الرقم الضريبي، 3 وقت الفاتورة، 4 الإجمالي شامل الضريبة، 5 مبلغ الضريبة
// يعمل في المتصفح والسيرفر
// ============================================================

function tlv(tag, value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  return [tag, bytes.length, ...bytes];
}

function toBase64(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
}

// sellerName, vatNumber, timestamp (Date أو نص ISO), total, vatTotal
export function zatcaQrValue({ sellerName, vatNumber, timestamp, total, vatTotal }) {
  const time = timestamp instanceof Date ? timestamp.toISOString() : String(timestamp);
  const bytes = [
    ...tlv(1, sellerName),
    ...tlv(2, vatNumber),
    ...tlv(3, time),
    ...tlv(4, Number(total).toFixed(2)),
    ...tlv(5, Number(vatTotal).toFixed(2)),
  ];
  return toBase64(bytes);
}
