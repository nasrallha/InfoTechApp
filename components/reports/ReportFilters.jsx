"use client";

import { useState } from "react";
import { Button, Card, Input, Select, Space } from "antd";
import { ClearOutlined, SearchOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { today } from "@/lib/dates";
import DayPicker from "@/components/common/DayPicker";

const pad = (x) => String(x).padStart(2, "0");
const shift = (day, days) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// اسم الفلتر في الواجهة ← اسمه في filters
const FIELD_KEY = {
  branch: "branchId",
  user: "userId",
  customer: "customerId",
  supplier: "supplierId",
  method: "paymentMethodId",
};

// الفترات السريعة
function presets() {
  const now = today();
  const y = Number(now.slice(0, 4));
  const m = Number(now.slice(5, 7));
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const prevLast = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const weekday = new Date(`${now}T12:00:00Z`).getUTCDay(); // 0 = الأحد
  return {
    today: { from: now, to: now },
    yesterday: { from: shift(now, -1), to: shift(now, -1) },
    week: { from: shift(now, -((weekday + 1) % 7)), to: now }, // الأسبوع يبدأ السبت
    month: { from: `${now.slice(0, 7)}-01`, to: now },
    lastMonth: { from: `${prevMonth}-01`, to: `${prevMonth}-${pad(prevLast)}` },
    year: { from: `${y}-01-01`, to: now },
  };
}

// ============================================================
// فلاتر التقرير (في الرابط): الفترة أو الربع + الفرع والكاشير والعميل ...
// fields: ["branch","user","customer","supplier","method","source","q"]
// quarters: true ← اختيار السنة (لوحدها = السنة كاملة) والربع (Q1..Q4) جنبها
// ============================================================
export default function ReportFilters({
  filters,
  options = {},
  fields = [],
  quarters,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("Reports");
  const [f, setF] = useState(filters);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v ?? null }));
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);
  const userOf = (x) => (locale === "ar" ? x.arFullname : x.enFullname);

  const go = (next) => {
    const q = new URLSearchParams();
    if (next.year) {
      q.set("year", String(next.year));
      if (next.qtr) q.set("qtr", String(next.qtr));
    } else {
      if (next.from) q.set("from", next.from);
      if (next.to) q.set("to", next.to);
    }
    const map = {
      branch: next.branchId,
      user: next.userId,
      customer: next.customerId,
      supplier: next.supplierId,
      method: next.paymentMethodId,
      source: next.source,
      q: next.q,
    };
    for (const [k, v] of Object.entries(map)) if (v) q.set(k, String(v));
    router.push(`${pathname}?${q.toString()}`);
  };

  // السنوات: السنة الحالية و 5 سنين قبلها
  const thisYear = Number(today().slice(0, 4));
  const yearOptions = Array.from({ length: 6 }, (_, i) => ({
    value: thisYear - i,
    label: String(thisYear - i),
  }));
  const quarterOptions = [1, 2, 3, 4].map((n) => ({
    value: n,
    label: t(`quarters.q${n}`),
  }));
  const byYear = Boolean(f.year);

  const P = presets();
  const sel = (key, list, label, toLabel = nameOf) =>
    fields.includes(key) &&
    list && (
      <Select
        allowClear
        showSearch
        optionFilterProp="label"
        style={{ width: 200 }}
        placeholder={label}
        value={f[FIELD_KEY[key]] ?? undefined}
        onChange={(v) => set(FIELD_KEY[key], v)}
        options={list.map((x) => ({
          value: x.id,
          label: x.code ? `${x.code} - ${toLabel(x)}` : toLabel(x),
        }))}
      />
    );

  return (
    <Card size="small" className="mb-4 report-filters">
      <Space wrap size={[8, 8]} className="mb-2">
        {Object.keys(P).map((k) => (
          <Button
            key={k}
            size="small"
            type={
              !f.year && f.from === P[k].from && f.to === P[k].to
                ? "primary"
                : "default"
            }
            onClick={() => {
              const next = { ...f, ...P[k], year: null, qtr: null };
              setF(next);
              go(next);
            }}
          >
            {t(`presets.${k}`)}
          </Button>
        ))}
      </Space>
      <Space wrap align="end" size={[8, 8]}>
        {quarters && (
          <>
            <div>
              <div className="text-gray-500 text-xs mb-1">{t("Year")}</div>
              <Select
                allowClear
                style={{ width: 110 }}
                placeholder={t("Year")}
                value={f.year ?? undefined}
                onChange={(v) =>
                  setF((x) => ({
                    ...x,
                    year: v ?? null,
                    qtr: v ? x.qtr : null,
                  }))
                }
                options={yearOptions}
              />
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">{t("Quarter")}</div>
              <Select
                allowClear
                style={{ width: 270 }}
                popupMatchSelectWidth={false}
                placeholder={t("WholeYear")}
                disabled={!byYear}
                value={f.qtr ?? undefined}
                onChange={(v) => set("qtr", v)}
                options={quarterOptions}
              />
            </div>
          </>
        )}
        <div>
          <div className="text-gray-500 text-xs mb-1">{t("From")}</div>
          <DayPicker
            style={{ width: 150 }}
            value={f.from}
            max={f.to}
            disabled={byYear}
            onChange={(v) => set("from", v)}
          />
        </div>
        <div>
          <div className="text-gray-500 text-xs mb-1">{t("To")}</div>
          <DayPicker
            style={{ width: 150 }}
            value={f.to}
            min={f.from}
            max={today()}
            disabled={byYear}
            onChange={(v) => set("to", v)}
          />
        </div>
        {sel("branch", options.branches, t("AllBranches"))}
        {sel("user", options.users, t("AllUsers"), userOf)}
        {sel("customer", options.customers, t("AllCustomers"))}
        {sel("supplier", options.suppliers, t("AllSuppliers"))}
        {sel("method", options.methods, t("AllMethods"))}
        {fields.includes("source") && (
          <Select
            allowClear
            style={{ width: 150 }}
            placeholder={t("AllSources")}
            value={f.source ?? undefined}
            onChange={(v) => set("source", v)}
            options={[
              { value: "pos", label: t("SourcePos") },
              { value: "invoice", label: t("SourceInvoice") },
            ]}
          />
        )}
        {fields.includes("q") && (
          <Input
            allowClear
            style={{ width: 150 }}
            placeholder={t("DocNo")}
            value={f.q ?? ""}
            onChange={(e) => set("q", e.target.value)}
            onPressEnter={() => go(f)}
          />
        )}
        <Button type="primary" icon={<SearchOutlined />} onClick={() => go(f)}>
          {t("Show")}
        </Button>
        <Button
          icon={<ClearOutlined />}
          onClick={() => {
            // إعادة الضبط: اليوم فقط وبدون أي فلاتر
            const next = { ...P.today, year: null, qtr: null };
            setF(next);
            go(next);
          }}
        >
          {t("Reset")}
        </Button>
      </Space>
    </Card>
  );
}
