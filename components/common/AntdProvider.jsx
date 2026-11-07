"use client";

import { useEffect } from "react";
import { App, ConfigProvider } from "antd";
import { setMessageInstance, setModalInstance } from "./feedback";
import { useNoAutofill } from "./useNoAutofill";
import arEG from "antd/locale/ar_EG";
import enUS from "antd/locale/en_US";
import { C } from "@/lib/theme";

// ============================================================
// إعدادات antd لكل البرنامج
// - direction: الاتجاه (عربي = من اليمين لليسار) حتى تكون الأيقونات وأزرار
//   البحث والحقول المجمّعة في مكانها الصحيح ومتناسقة
// - locale: نصوص antd الداخلية (التقويم، الجداول، النوافذ) بلغة البرنامج
// - theme: الألوان والأحجام الموحدة (ارتفاع الحقول والأزرار، الخط، الحواف)
// ============================================================

// لون البرنامج الأساسي (كل الألوان في lib/theme.js)
export const BRAND_COLOR = C.primary;

const theme = {
  token: {
    colorPrimary: C.primary,
    colorLink: C.primary,
    colorSuccess: C.success,
    colorError: C.danger,
    colorWarning: C.warning,
    colorInfo: C.info,
    colorText: C.text,
    colorTextSecondary: C.text2,
    colorTextTertiary: C.muted,
    colorTextQuaternary: C.subtle,
    colorBorder: C.borderStrong,
    colorBorderSecondary: C.border,
    colorBgLayout: C.bg,
    colorBgContainer: C.surface,
    borderRadius: 8,
    // ارتفاع الحقول والأزرار: عادي / صغير (داخل الجداول) / كبير
    controlHeight: 38,
    controlHeightSM: 30,
    controlHeightLG: 44,
    fontSize: 14,
    fontFamily: "var(--font-main), 'Segoe UI', Tahoma, Arial, sans-serif",
  },
  components: {
    Button: { fontWeight: 500, primaryShadow: "none", dangerShadow: "none" },
    Card: { headerFontSize: 15 },
    InputNumber: { controlWidth: 120 },
    // القائمة الجانبية: نفس اللون الغامق المشتق من لون البرنامج
    Layout: { siderBg: C.ink, triggerBg: C.inkDeep },
    // العنصر المختار: بلون البرنامج (تركواز) فوق التركواز الغامق
    Menu: {
      darkItemBg: C.ink,
      darkSubMenuItemBg: C.inkDeep,
      darkPopupBg: C.ink,
      darkItemColor: "rgba(255, 255, 255, 0.88)",
      darkItemSelectedBg: C.primary,
      darkItemSelectedColor: C.onDark,
      darkItemHoverBg: "rgba(255, 255, 255, 0.1)",
      darkItemHoverColor: C.onDark,
      darkGroupTitleColor: "rgba(255, 255, 255, 0.6)",
    },
    // عناوين الحقول: أعرض شوية وبلون النص الأساسي
    Form: { labelColor: C.text },
    // أزرار الاختيار (Segmented): المختار بلون البرنامج وكتابة بيضا،
    // والخلفية فاتحة بلون البرنامج بدل الرمادي/الأبيض اللي مش باين
    Segmented: {
      trackBg: C.primarySoft,
      itemColor: C.text2,
      itemHoverColor: C.primary,
      itemHoverBg: C.primaryBorder,
      itemSelectedBg: C.primary,
      itemSelectedColor: C.onDark,
      trackPadding: 3,
    },
  },
};

export default function AntdProvider({ locale, children }) {
  // مفيش اقتراحات من المتصفح في أي حقل (الاسم، الجوال، الضريبي ...)
  useNoAutofill();
  useNumericInputGuard();

  return (
    <ConfigProvider
      direction={locale === "ar" ? "rtl" : "ltr"}
      locale={locale === "ar" ? arEG : enUS}
      theme={theme}
    >
      {/* App: يربط رسائل التنبيه بالثيم والاتجاه (انظر feedback.js) */}
      <App component={false}>
        <MessageBridge />
        {children}
      </App>
    </ConfigProvider>
  );
}

// يسلّم نسخة الرسائل المربوطة بالثيم لـ feedback.js
function MessageBridge() {
  const { message, modal } = App.useApp();
  useEffect(() => {
    setMessageInstance(message);
    setModalInstance(modal);
    return () => {
      setMessageInstance(null);
      setModalInstance(null);
    };
  }, [message, modal]);
  return null;
}

// ============================================================
// حقول الأرقام (السعر، التكلفة، الكمية، الخصم ...): أرقام فقط
// antd يسمح بكتابة حروف ثم يتجاهلها، فنمنعها من الأساس في كل البرنامج:
// - الكتابة: يُقبل 0-9 والعلامة العشرية والسالب فقط
// - اللصق: نحذف أي شيء غير رقم ونلصق الباقي
// ============================================================
const ALLOWED_CHAR = /^[0-9.\-]$/;
const NUMBER_INPUT = ".ant-input-number-input";

function useNumericInputGuard() {
  useEffect(() => {
    const isNumberInput = (el) => el?.matches?.(NUMBER_INPUT);

    const onKeyDown = (e) => {
      if (!isNumberInput(e.target)) return;
      // اختصارات (نسخ، لصق، تحديد الكل ...) ومفاتيح التحكم مسموحة
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      if (!ALLOWED_CHAR.test(e.key)) e.preventDefault();
    };

    const onPaste = (e) => {
      if (!isNumberInput(e.target)) return;
      const text = e.clipboardData?.getData("text") ?? "";
      const clean = text.replace(/[^0-9.\-]/g, "");
      if (clean === text) return;
      e.preventDefault();
      if (clean) document.execCommand("insertText", false, clean);
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("paste", onPaste, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("paste", onPaste, true);
    };
  }, []);
}
