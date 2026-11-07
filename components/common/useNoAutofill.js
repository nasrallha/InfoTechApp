"use client";

import { useEffect } from "react";

// ============================================================
// منع اقتراحات المتصفح (autocomplete) في البرنامج كله
// الاسم والجوال والرقم الضريبي والعنوان والسجل التجاري ... كلها من غير
// اقتراحات من اللي اتكتب قبل كده
// - اقتراحات البرنامج نفسه (زي نوع السيارة) مش متأثرة: دي من antd
// - الباسورد والإيميل كمان
// ============================================================
const SKIP_TYPES = new Set(["checkbox", "radio", "file", "submit", "button"]);

// الحقل اتعمله hydration؟ (React بيحط مفتاح __reactFiber$ على العنصر)
// قبل كده أي تعديل في الـ attributes بيعمل hydration mismatch
// (الحقل اللي عليه autoFocus بياخد التركيز قبل ما الصفحة تكمل hydration)
const hydrated = (el) =>
  Object.keys(el).some((k) => k.startsWith("__reactFiber$"));

function disable(el, tries = 0) {
  const tag = el?.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA") return;
  if (!hydrated(el)) {
    // نستنى لحد ما React يمسك الحقل (لحد 3 ثواني تقريباً)
    if (tries < 60) setTimeout(() => disable(el, tries + 1), 50);
    return;
  }
  if (el.type === "hidden") return;
  // حقول Select / AutoComplete بتاعة antd: هي اللي بتتحكم فيها
  if (el.getAttribute("role") === "combobox") return;
  if (SKIP_TYPES.has(el.type)) return;
  const want = el.type === "password" ? "new-password" : "off";
  if (el.getAttribute("autocomplete") !== want)
    el.setAttribute("autocomplete", want);
  // المتصفح بيحفظ اللي اتكتب ويقترحه تاني على حسب اسم الحقل (name/id)
  // اسم عشوائي جديد كل مرة ← مفيش حاجة محفوظة تطابقه، فمفيش اقتراحات
  // (antd مش بيستخدم name في الـ DOM، فده مش بيأثر على الفورم)
  if (!el.dataset.noac && !el.hasAttribute("name")) {
    el.dataset.noac = "1";
    el.setAttribute("name", `f${Math.random().toString(36).slice(2, 10)}`);
  }
  const form = el.form;
  if (form && form.getAttribute("autocomplete") !== "off")
    form.setAttribute("autocomplete", "off");
}

export function useNoAutofill() {
  useEffect(() => {
    const onFocus = (e) => disable(e.target);
    // قبل ما المتصفح يعرض الاقتراحات (الضغط أو التركيز)
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("pointerdown", onFocus, true);
    // ملحوظة: منغيرش الحقول قبل ما المستخدم يلمسها، عشان التعديل قبل
    // الـ hydration بيعمل تحذير hydration mismatch (الباسورد في صفحات
    // الدخول متحدد autoComplete بتاعه في الكود نفسه)
    return () => {
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("pointerdown", onFocus, true);
    };
  }, []);
}
