// خطأ "متوقع" نرميه من الـ services عندما تكون العملية غير مسموحة
// مثل: اسم مكرر، أو حذف قسم مستخدم.
// code = مفتاح ترجمة من messages (قسم Alerts) حتى تظهر الرسالة بلغة المستخدم
// details = بيانات إضافية للواجهة (مثل أسماء الأقسام المستخدمة)
// fieldErrors = لو الخطأ يخص حقلاً معيناً: { phone: "PhoneExists" } فيظهر تحت الحقل
export class AppError extends Error {
  constructor(code, details = null, fieldErrors = null) {
    super(code);
    this.name = "AppError";
    this.code = code;
    this.details = details;
    this.fieldErrors = fieldErrors;
  }
}
