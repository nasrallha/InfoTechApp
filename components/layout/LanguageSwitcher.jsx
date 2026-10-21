"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";

export default function LanguageSwitcher() {

  const locale = useLocale(); 
  
  const pathname = usePathname();
  const router = useRouter();
 

  const handleLanguageChange = (newLocale) => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <div className="language-wraper flex gap-4">
         <button
        onClick={() => handleLanguageChange("en")}
        className={`btn ${locale === "en" ? "btn-neutral" : "btn-outline"}`}
      >
        EN
      </button>
      <button
        onClick={() => handleLanguageChange("ar")}
        className={`btn ${locale === "ar" ? "btn-neutral" : "btn-outline"}`}
      >
        Ar
      </button>

    </div>
  );
}