// ============================================================
// منع المتصفح من الملء التلقائي لحقول الدخول (اسم المستخدم / كلمة المرور)
// - autoComplete="off" لوحده المتصفحات (زي Chrome) بتتجاهله في حقول الباسورد
// - فالحقل بيبدأ readOnly (المتصفح مابيملاش الحقول اللي للقراءة بس)
//   وأول ما المستخدم يلمسه أو يدخل عليه بنشيل readOnly ويكتب عادي
//   (pointerdown قبل focus عشان كيبورد الموبايل يفتح من أول لمسة)
// ============================================================
const unlock = (e) => e.currentTarget.removeAttribute("readonly");

export const noAutofill = {
  autoComplete: "off",
  readOnly: true,
  onFocus: unlock,
  onPointerDown: unlock,
};
