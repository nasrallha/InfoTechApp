"use client";

import { Button } from "antd";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";

// تبديل اللغة: اللغة الحالية بلون البرنامج (primary) والتانية زر هادئ
// (كانت أزرار daisyUI بخلفية سودا مش ماشية مع ألوان البرنامج)
const LANGS = [
  { code: "en", label: "EN" },
  { code: "ar", label: "AR" },
];

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const handleLanguageChange = (newLocale) => {
    if (newLocale !== locale) router.replace(pathname, { locale: newLocale });
  };

  return (
    <div className="language-wraper flex gap-1.5">
      {LANGS.map(({ code, label }) => (
        <Button
          key={code}
          type={locale === code ? "primary" : "default"}
          aria-pressed={locale === code}
          onClick={() => handleLanguageChange(code)}
          style={{ minWidth: 44, fontWeight: 600 }}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
