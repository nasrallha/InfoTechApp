"use client";

import { Empty } from "antd";
import { useLocale, useTranslations } from "next-intl";

// ============================================================
// نتايج البحث عن عميل (الاسم / الجوال / الكود) + أسماء أشخاصه
// (بدل List بتاعة antd - اتلغت في النسخ الجديدة)
// ============================================================
export default function CustomerResults({ results, onPick }) {
  const t = useTranslations("Tailoring");
  const locale = useLocale();
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName || x.arName);
  if (!results.length)
    return (
      <Empty
        className="mt-2"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={t("NoCustomersFound")}
      />
    );
  return (
    <div className="tailor-results mt-2">
      {results.map((c) => (
        <button
          type="button"
          key={c.id}
          className="tailor-results__row"
          onClick={() => onPick(c.id)}
        >
          <bdi className="text-slate-500">{c.code}</bdi>
          <b>{nameOf(c)}</b>
          {c.phone && <bdi>{c.phone}</bdi>}
          <span className="tailor-results__persons">
            {c.tailorPersons.map((p) => p.name).join("، ")}
          </span>
        </button>
      ))}
    </div>
  );
}
