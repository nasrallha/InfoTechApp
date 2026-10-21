// تعرض أخطاء التحقق القادمة من السيرفر تحت كل حقل في فورم antd
// fieldErrors: { arName: "MinCharcters", "units.0.price": "RequiredField" }
// t: دالة الترجمة لقسم Alerts
export function applyFieldErrors(form, fieldErrors, t) {
  if (!fieldErrors) return;

  form.setFields(
    Object.entries(fieldErrors).map(([path, code]) => ({
      // "units.0.price" ← ["units", 0, "price"] (شكل أسماء الحقول داخل Form.List)
      name: path.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
      errors: [t(code)],
    })),
  );
}
