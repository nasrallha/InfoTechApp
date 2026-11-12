// ============================================================
// تأجير العقارات (مشترك بين الواجهة والسيرفر - مفيش حاجة سرية)
// - أنواع الوحدات واستخدامها (سكني معفى من الضريبة / تجاري بالضريبة)
// - فترات السداد
// - خانات صيغة العقد ({tenant_name} ...) وملؤها
// - جدول الدفعات من مدة العقد وفترة السداد
// ============================================================

export const UNIT_KINDS = ["apartment", "office", "shop", "warehouse", "villa", "other"];
// residential سكني (معفى من الضريبة) | commercial تجاري (بنسبة ضريبة الشركة)
export const USE_TYPES = ["residential", "commercial"];
// فترة السداد بالشهور
export const PAY_EVERY = [1, 3, 6, 12];

// خانات صيغة العقد (بتتملي لوحدها وقت الطباعة / الحفظ)
export const TEMPLATE_FIELDS = [
  "contract_no",
  "ejar_no",
  "contract_date",
  "company_name",
  "owner_name",
  "tenant_name",
  "tenant_id",
  "tenant_phone",
  "tenant_address",
  "property",
  "units",
  "use_type",
  "start_date",
  "end_date",
  "duration",
  "annual_rent",
  "total_amount",
  "pay_every",
  "installments_count",
  "installment_amount",
  "installments_table",
];

// ملء الخانات: {key} ← القيمة (الخانة المجهولة بتفضل زي ما هي)
export function fillTemplate(content, values) {
  return String(content ?? "").replace(/\{([a-z_]+)\}/g, (all, key) =>
    values[key] == null ? all : String(values[key]),
  );
}

// النموذج الافتراضي (أول مرة تتفتح الشاشة) - بيتعدّل من «نماذج العقود»
export const DEFAULT_TEMPLATE = `عقد إيجار رقم {contract_no}
رقم العقد في منصة إيجار: {ejar_no}
تاريخ العقد: {contract_date}

إنه في يوم {contract_date} تم الاتفاق بين كل من:
الطرف الأول (المؤجر): {company_name}، نيابة عن المالك: {owner_name}
الطرف الثاني (المستأجر): {tenant_name}، رقم الهوية / السجل: {tenant_id}، الجوال: {tenant_phone}
العنوان: {tenant_address}

البند الأول - العين المؤجرة:
{units} في {property}، والاستخدام: {use_type}.

البند الثاني - مدة العقد:
مدة هذا العقد {duration}، تبدأ من {start_date} وتنتهي في {end_date}.

البند الثالث - قيمة الإيجار وطريقة السداد:
قيمة الإيجار السنوية {annual_rent}، وإجمالي قيمة العقد {total_amount}،
تُسدد على {installments_count} دفعات، كل {pay_every}، قيمة الدفعة {installment_amount}، حسب الجدول التالي:
{installments_table}

البند الرابع - التزامات المستأجر:
يلتزم المستأجر باستخدام العين المؤجرة فيما أُعدّت له، والمحافظة عليها، وسداد الدفعات في مواعيدها.

البند الخامس - أحكام عامة:
يخضع هذا العقد للأنظمة المعمول بها في المملكة العربية السعودية.

توقيع الطرف الأول: ____________________        توقيع الطرف الثاني: ____________________
`;

// ------------------------------------------------------------
// التواريخ (YYYY-MM-DD) - من غير مناطق زمنية
// ------------------------------------------------------------
const pad = (n) => String(n).padStart(2, "0");
const toDay = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseDay = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00Z`);

// يوم + عدد شهور (آخر يوم في الشهر لو اليوم مش موجود: 31/1 + شهر = 28/2)
export function addMonths(day, months) {
  const d = parseDay(day);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return toDay(target);
}
export const addDays = (day, n) => {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
};
// عدد الأيام بين يومين (شامل الاتنين)
export const daysBetween = (from, to) =>
  Math.round((parseDay(to) - parseDay(from)) / 86_400_000) + 1;

// عدد الشهور في فترة (من - إلى شامل): الكاملة + كسر الأيام الباقية من شهر
// (1/10 - 31/10 = 1 | 1/10 - 15/11 = 1 + 15/30)
export function monthsIn(from, to) {
  let full = 0;
  while (full < 1200 && addDays(addMonths(from, full + 1), -1) <= to) full++;
  const restFrom = addMonths(from, full);
  if (restFrom > to) return full;
  const monthDays = daysBetween(restFrom, addDays(addMonths(restFrom, 1), -1));
  return full + daysBetween(restFrom, to) / monthDays;
}

// نهاية العقد الافتراضية: البداية + شهور - يوم (سنة من 1/1 ← 31/12)
export const defaultEndDate = (start, months = 12) =>
  addDays(addMonths(start, months), -1);

// ------------------------------------------------------------
// جدول الدفعات
// - كل دفعة: فترة (من - إلى) + ميعاد الاستحقاق (أول يوم في الفترة) + المبلغ
// - المبلغ = الإيجار السنوي × شهور الفترة ÷ 12، والفترة الأخيرة الناقصة بالأيام
// - آخر دفعة بتاخد فرق التقريب عشان المجموع = إجمالي العقد بالظبط
// annualRent: مجموع الإيجار السنوي للوحدات | decimals: خانات العملة
// ------------------------------------------------------------
export function buildInstallments({ startDate, endDate, payEvery, annualRent, decimals = 2 }) {
  const rows = [];
  if (!startDate || !endDate || !(payEvery > 0) || endDate < startDate) return rows;
  const round = (v) => Math.round((v + Number.EPSILON) * 10 ** decimals) / 10 ** decimals;
  const monthly = Number(annualRent) / 12;
  let from = startDate;
  for (let i = 0; i < 600 && from <= endDate; i++) {
    const fullTo = addDays(addMonths(from, payEvery), -1);
    const to = fullTo > endDate ? endDate : fullTo;
    // فترة كاملة ← شهور × الإيجار الشهري
    // فترة ناقصة (آخر العقد) ← الشهور الكاملة فيها + باقي الأيام من شهر
    const amount =
      to === fullTo ? monthly * payEvery : monthly * monthsIn(from, to);
    rows.push({ seq: i + 1, periodFrom: from, periodTo: to, dueDate: from, amount: round(amount) });
    from = addDays(to, 1);
  }
  return rows;
}

// إجمالي العقد = الإيجار السنوي عن المدة كلها (مجموع الدفعات)
export const contractTotal = (rows) =>
  rows.reduce((s, r) => s + r.amount, 0);

// ------------------------------------------------------------
// قيم خانات صيغة العقد (الواجهة للمعاينة والسيرفر وقت الحفظ - نفس النتيجة)
// c: { number, docNo, ejarNo, contractDate, companyName, tenant: { name, idNo, phone, address },
//      units: [{ unitNo, kind, useType, annualRent, property: { name, ownerName } }],
//      startDate, endDate, payEvery, installments }
// fmt: { money(v), day(d), kind(code), useType(code), payEvery(n), duration(months),
//        row(installment) ← سطر في جدول الدفعات }
// ------------------------------------------------------------
export function contractValues(c, fmt) {
  const units = c.units ?? [];
  const uniq = (list) => [...new Set(list.filter(Boolean))].join("، ");
  const annual = units.reduce((s, u) => s + Number(u.annualRent || 0), 0);
  const rows = c.installments ?? [];
  const total = contractTotal(rows);
  const amounts = [...new Set(rows.map((r) => r.amount))];
  return {
    contract_no: c.docNo ?? undefined,
    ejar_no: c.ejarNo || "—",
    contract_date: c.contractDate ? fmt.day(c.contractDate) : undefined,
    company_name: c.companyName ?? "",
    owner_name: uniq(units.map((u) => u.property?.ownerName)) || c.companyName || "",
    tenant_name: c.tenant?.name ?? "",
    tenant_id: c.tenant?.idNo || "—",
    tenant_phone: c.tenant?.phone || "—",
    tenant_address: c.tenant?.address || "—",
    property: uniq(units.map((u) => u.property?.name)),
    units: units.map((u) => `${fmt.kind(u.kind)} ${u.unitNo}`).join("، "),
    use_type: uniq(units.map((u) => fmt.useType(u.useType))),
    start_date: c.startDate ? fmt.day(c.startDate) : "",
    end_date: c.endDate ? fmt.day(c.endDate) : "",
    duration: c.startDate && c.endDate ? fmt.duration(monthsIn(c.startDate, c.endDate)) : "",
    annual_rent: fmt.money(annual),
    total_amount: fmt.money(total),
    pay_every: fmt.payEvery(c.payEvery),
    installments_count: String(rows.length),
    // الدفعات المتساوية ← قيمة واحدة، غير كده ← "حسب الجدول"
    installment_amount: amounts.length === 1 ? fmt.money(amounts[0]) : fmt.money(rows[0]?.amount ?? 0),
    installments_table: rows.map((r) => fmt.row(r)).join("\n"),
  };
}
