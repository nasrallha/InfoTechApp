// بيانات منتج تجريبي لمعاينة الملصق في الإعدادات
// الكود 6281234567895 صالح لـ EAN13 و CODE128
export const sampleItem = (locale) => ({
  name: locale === "ar" ? "منتج تجريبي للمعاينة" : "Sample product",
  code: "6281234567895",
  price: 15,
});

