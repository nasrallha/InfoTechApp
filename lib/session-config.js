// إعدادات الجلسة المشتركة بين proxy.js والسيرفر
// (لا يحتوي أي شيء سري، فمسموح استيراده من أي مكان)

// اسم الـ cookie التي تحمل رقم الجلسة
export const SESSION_COOKIE = "erp_session";

// مدة الجلسة وعدم النشاط: من شاشة الإعدادات ← الدخول والأمان (security_settings)

// كود الشركة على الجهاز (وضع الشركات، lib/tenant.js)
export const TENANT_COOKIE = "erp_company";
