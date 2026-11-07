// فاصل القوائم حسب لغة الواجهة: «، » في العربي و «, » في الإنجليزي
// الاستخدام: names.join(listSep(locale))
export const listSep = (locale) => (locale === "ar" ? "، " : ", ");
