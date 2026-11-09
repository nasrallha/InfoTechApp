// ============================================================
// رقم الجوال حسب بلد الشغل (العملة الأساسية للبرنامج)
// - ريال سعودي: 10 أرقام تبدأ بـ 05 (05XXXXXXXX)
// - جنيه مصري: 11 رقم تبدأ بـ 010 / 011 / 012 / 015
// - غيرهم: أرقام من 7 لـ 15 (ممكن تبدأ بـ +)
// نفس القاعدة في الواجهة (usePhoneRule) والسيرفر (lib/phone-check)
// error: مفتاح الرسالة في Alerts
// ============================================================
const RULES = {
  SAR: { re: /^05\d{8}$/, max: 10, example: "05XXXXXXXX", error: "PhoneInvalidSA" },
  EGP: { re: /^01[0125]\d{8}$/, max: 11, example: "01XXXXXXXXX", error: "PhoneInvalidEG" },
};
const OTHER = { re: /^\+?\d{7,15}$/, max: 16, example: "", error: "PhoneInvalid" };

export const phoneRule = (currencyCode) => RULES[currencyCode] ?? OTHER;

// الحقول اللي فيها جوال: phone / customerPhone / ...Phone
export const isPhoneKey = (key) => key === "phone" || /Phone$/.test(key);
