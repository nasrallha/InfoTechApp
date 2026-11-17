// ============================================================
// المقاولات (مشترك بين الواجهة والسيرفر - مفيش حاجة سرية)
// - أنواع العقود: مع المالك (إحنا المقاول) / مع مقاول باطن
// - حساب المستخلص: الأعمال - استرداد الدفعة المقدمة = الخاضع للضريبة
//   + الضريبة = إجمالي الفاتورة، - حجز الضمان - غرامة التأخير = الصافي المستحق
//   (نفس حساب فاتورة البيع / الشراء بالظبط: lib/invoice-calc)
// - خانات صيغة العقد ({party_name} ...) وملؤها
// - لصق بنود المقايسة من Excel
// ============================================================
import { calcInvoice, round } from "./invoice-calc";
import { daysBetween, fillTemplate } from "./rent";
import { formatDocNo } from "./doc-number";
import { dbDateToDay } from "./dates";

export { fillTemplate };

// owner: عقد مع المالك ← فواتير بيع | sub: عقد مقاول باطن ← فواتير شراء
export const CONTRACT_KINDS = ["owner", "sub"];
export const CONTRACT_STATUSES = ["active", "completed", "cancelled"];
// المستخلص: بالكميات لكل بند / مبلغ إجمالي
export const CERT_MODES = ["qty", "lump"];
// التحصيل / السداد: دفعة عادية / إفراج عن حجز الضمان
export const PAYMENT_KINDS = ["payment", "retention"];

const num = (v) => Number(v) || 0;

// إجمالي بند: الكمية × السعر (مقرّب لخانات العملة)
export const itemAmount = (qty, price, decimals = 2) => round(num(qty) * num(price), decimals);

// ------------------------------------------------------------
// باقي الدفعة المقدمة اللي لسه ما اتستردتش (قبل الضريبة)
// = فاتورة الدفعة المقدمة من البرنامج (لو اتعملت) + رصيد دفعة سابقة اتفوترت برّه البرنامج - المسترد
// ------------------------------------------------------------
export function advanceBalance({ advanceIssued, advanceAmount, priorAdvance, recovered, decimals = 2 }) {
  const total = (advanceIssued ? num(advanceAmount) : 0) + num(priorAdvance);
  return Math.max(0, round(total - num(recovered), decimals));
}

// ------------------------------------------------------------
// قيمة سطر في المستخلص من بند المقايسة
// - الكمية التراكمية وصلت كمية البند ← باقي إجمالي البند بالظبط (من غير فرق تقريب)
// - غير كده ← الكمية × السعر
// item: { qty, price, amount } | prevQty / prevAmount: المستخلصات اللي قبله
// ------------------------------------------------------------
export function certLineAmount(item, qty, prevQty, prevAmount, decimals = 2) {
  const q = num(qty);
  if (!q) return 0;
  const done = round(num(prevQty) + q, 3) >= round(num(item.qty), 3) - 1e-9;
  if (done && num(item.amount) > 0) return round(num(item.amount) - num(prevAmount), decimals);
  return itemAmount(q, item.price, decimals);
}

// ------------------------------------------------------------
// حساب المستخلص
// amounts: قيم السطور (قبل الضريبة)
// contract: { recoveryPct, retentionPct, taxRate }
// advanceLeft: باقي الدفعة المقدمة (اللي اتفوترت ولسه ما اتستردتش)
// isFinal: الختامي ← يسترد كل الباقي
// recovery / retention: قيمة مكتوبة بإيد المستخدم (فاضي = بالنسبة)
// يرجع: { gross, recovery, taxable, tax, invoiceTotal, retention, penalty, net }
// ------------------------------------------------------------
export function certificateCalc({
  amounts,
  contract,
  advanceLeft = 0,
  isFinal = false,
  recovery = null,
  retention = null,
  penalty = 0,
  decimals = 2,
}) {
  const lines = amounts.filter((a) => num(a) > 0);
  const gross = round(lines.reduce((s, a) => s + num(a), 0), decimals);
  const left = Math.max(0, num(advanceLeft));
  const byPct = isFinal ? left : round((gross * num(contract.recoveryPct)) / 100, decimals);
  const rec = Math.min(recovery != null ? num(recovery) : byPct, left, gross);
  const { totals } = calcInvoice({
    items: lines.map((a) => ({ qty: 1, price: num(a), taxRate: num(contract.taxRate) })),
    taxMode: "exclusive",
    discountType: "amount",
    discountValue: rec,
    decimals,
  });
  const ret =
    retention != null
      ? Math.min(num(retention), gross)
      : round((gross * num(contract.retentionPct)) / 100, decimals);
  const pen = Math.max(0, round(num(penalty), decimals));
  const invoiceTotal = gross > 0 ? totals.total : 0;
  return {
    gross,
    recovery: round(rec, decimals),
    taxable: round(gross - rec, decimals),
    tax: gross > 0 ? totals.tax : 0,
    invoiceTotal,
    retention: ret,
    penalty: pen,
    net: round(invoiceTotal - ret - pen, decimals),
  };
}

// ------------------------------------------------------------
// غرامة التأخير المقترحة (المستخلص اللي بعد موعد التسليم)
// أيام التأخير × قيمة اليوم، وبحد أقصى نسبة من قيمة العقد (ناقص الغرامات اللي اتخصمت قبل كده)
// ------------------------------------------------------------
export function penaltySuggestion({ endDate, date, perDay, maxPct, total, previous = 0, decimals = 2 }) {
  if (!endDate || !date || date <= endDate || !(num(perDay) > 0)) return { days: 0, amount: 0 };
  const days = daysBetween(endDate, date) - 1;
  let amount = round(days * num(perDay), decimals);
  if (num(maxPct) > 0) {
    const cap = round((num(total) * num(maxPct)) / 100 - num(previous), decimals);
    amount = Math.max(0, Math.min(amount, cap));
  }
  return { days, amount };
}

// ------------------------------------------------------------
// لصق بنود المقايسة من Excel (أعمدة مفصولة بـ Tab):
//   رقم البند | الوصف | الوحدة | الكمية | السعر | الإجمالي
// - الوصف لوحده مطلوب، والسعر لو فاضي بيتحسب من الإجمالي ÷ الكمية
// - سطر العناوين (مفيهوش أرقام) بيتشال
// ------------------------------------------------------------
const toNumber = (s) => {
  const v = Number(String(s ?? "").replace(/[,\s٬]/g, "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return Number.isFinite(v) ? v : null;
};
export function parsePastedItems(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((c) => c.trim()))
    .filter((cells) => cells.some(Boolean))
    .map((c) => {
      // عمود واحد = الوصف بس
      if (c.length === 1) return { itemNo: "", description: c[0], unitName: "", qty: 1, price: 0, amount: 0 };
      const [itemNo, description, unitName, q, p, t] = c;
      const qty = toNumber(q);
      const price = toNumber(p);
      const total = toNumber(t);
      return {
        itemNo: itemNo ?? "",
        description: description ?? "",
        unitName: unitName ?? "",
        qty: qty ?? (total != null || price != null ? 1 : null),
        price: price ?? (total != null && qty ? total / qty : null),
        amount: total,
      };
    })
    .filter((r) => r.description && (r.qty != null || r.price != null))
    .map((r) => {
      const qty = r.qty ?? 1;
      const price = r.price ?? 0;
      return {
        itemNo: String(r.itemNo).slice(0, 30),
        description: String(r.description).slice(0, 500),
        unitName: String(r.unitName).slice(0, 30),
        qty,
        price: Math.round(price * 10000) / 10000,
        // الإجمالي المكتوب في الملف هو المرجع (السعر ممكن يكون كسر)
        amount: r.amount ?? itemAmount(qty, price),
      };
    });
}

// ------------------------------------------------------------
// خانات صيغة العقد
// ------------------------------------------------------------
export const TEMPLATE_FIELDS = [
  "contract_no",
  "ref_no",
  "contract_date",
  "company_name",
  "first_party",
  "second_party",
  "party_name",
  "party_id",
  "party_phone",
  "party_address",
  "project_name",
  "project_location",
  "start_date",
  "end_date",
  "duration_days",
  "contract_value",
  "tax_rate",
  "tax_amount",
  "total_with_tax",
  "advance_pct",
  "advance_amount",
  "recovery_pct",
  "retention_pct",
  "retention_amount",
  "retention_release_date",
  "penalty_per_day",
  "penalty_max_pct",
];

// النموذج الافتراضي (أول مرة) - بيتعدّل من «نماذج العقود»
export const DEFAULT_TEMPLATE = `عقد مقاولة رقم {contract_no}
تاريخ العقد: {contract_date}

إنه في يوم {contract_date} تم الاتفاق بين كل من:
الطرف الأول: {first_party}
الطرف الثاني: {second_party}
(بيانات الطرف: {party_name}، رقم السجل / الهوية: {party_id}، الجوال: {party_phone}، العنوان: {party_address})

البند الأول - موضوع العقد:
يتولى الطرف الثاني تنفيذ أعمال مشروع «{project_name}» بموقع {project_location}، وتُحاسب الأعمال المنفذة بموجب مستخلصات دورية معتمدة.

البند الثاني - مدة التنفيذ:
تبدأ الأعمال في {start_date}، ويلتزم الطرف الثاني بتسليمها كاملة في موعد أقصاه {end_date}، بمدة قدرها {duration_days} يوماً.

البند الثالث - قيمة العقد:
قيمة العقد {contract_value} غير شاملة ضريبة القيمة المضافة، وتُضاف إليها الضريبة بنسبة {tax_rate} بمبلغ {tax_amount}، ليكون الإجمالي {total_with_tax}.

البند الرابع - الدفعة المقدمة:
يصرف الطرف الأول دفعة مقدمة بنسبة {advance_pct} من قيمة العقد بمبلغ {advance_amount} (قبل الضريبة) بموجب فاتورة ضريبية، وتُسترد بنسبة {recovery_pct} من قيمة كل مستخلص حتى استردادها بالكامل.

البند الخامس - المستخلصات وحجز الضمان:
تُصرف قيمة الأعمال المنفذة بموجب مستخلصات دورية معتمدة، ويُحجز من كل مستخلص نسبة {retention_pct} ضماناً لحسن التنفيذ (بإجمالي {retention_amount} على قيمة العقد)، ويُفرج عنها في {retention_release_date}.

البند السادس - غرامة التأخير:
في حالة التأخير عن موعد التسليم تُحتسب غرامة قدرها {penalty_per_day} عن كل يوم تأخير، بحد أقصى {penalty_max_pct} من قيمة العقد.

البند السابع - أحكام عامة:
يخضع هذا العقد للأنظمة المعمول بها في المملكة العربية السعودية.

توقيع الطرف الأول: ____________________        توقيع الطرف الثاني: ____________________
`;

// ------------------------------------------------------------
// قيم خانات الصيغة (الواجهة للمعاينة والسيرفر وقت الحفظ - نفس النتيجة)
// c: { kind, docNo, refNo, signDate, companyName, party: { name, idNo, phone, address },
//      projectName, projectLocation, startDate, endDate, taxRate, advancePct, recoveryPct,
//      retentionPct, retentionReleaseDate, penaltyPerDay, penaltyMaxPct,
//      value: قيمة العقد قبل الضريبة (مكتوبة) | items: المقايسة (العقود القديمة) }
// fmt: { money(v), day(d), pct(v), qty(v), row(item, i) }
// ------------------------------------------------------------
export function contractValues(c, fmt, decimals = 2) {
  const items = c.items ?? [];
  // قيمة العقد: المكتوبة، أو مجموع المقايسة (العقود القديمة اللي ليها بنود)
  const value = items.length
    ? round(items.reduce((s, it) => s + num(it.amount), 0), decimals)
    : round(num(c.value), decimals);
  const tax = round((value * num(c.taxRate)) / 100, decimals);
  const party = c.party?.name ?? "";
  const company = c.companyName ?? "";
  // عقد المالك: الأول = المالك والتاني = إحنا (المقاول) | الباطن: الأول = إحنا
  const owner = c.kind !== "sub";
  return {
    contract_no: c.docNo ?? undefined,
    ref_no: c.refNo || "—",
    contract_date: c.signDate ? fmt.day(c.signDate) : "",
    company_name: company,
    first_party: owner ? party : company,
    second_party: owner ? company : party,
    party_name: party,
    party_id: c.party?.idNo || "—",
    party_phone: c.party?.phone || "—",
    party_address: c.party?.address || "—",
    project_name: c.projectName ?? "",
    project_location: c.projectLocation || "—",
    start_date: c.startDate ? fmt.day(c.startDate) : fmt.day(c.signDate),
    end_date: c.endDate ? fmt.day(c.endDate) : "",
    duration_days:
      c.endDate && (c.startDate || c.signDate)
        ? String(daysBetween(c.startDate || c.signDate, c.endDate))
        : "",
    contract_value: fmt.money(value),
    tax_rate: fmt.pct(c.taxRate),
    tax_amount: fmt.money(tax),
    total_with_tax: fmt.money(value + tax),
    advance_pct: fmt.pct(c.advancePct),
    advance_amount: fmt.money(round((value * num(c.advancePct)) / 100, decimals)),
    recovery_pct: fmt.pct(c.recoveryPct),
    retention_pct: fmt.pct(c.retentionPct),
    retention_amount: fmt.money(round((value * num(c.retentionPct)) / 100, decimals)),
    retention_release_date: c.retentionReleaseDate ? fmt.day(c.retentionReleaseDate) : "—",
    penalty_per_day: fmt.money(c.penaltyPerDay),
    penalty_max_pct: fmt.pct(c.penaltyMaxPct),
    // النماذج القديمة اللي فيها {boq_table}: الخانة بتتملي فاضية (مفيش مقايسة في العقد)
    boq_table: items.length ? items.map((it, i) => fmt.row(it, i)).join("\n") : "",
  };
}

// رقم المستخلص: مسلسل واحد لكل المستخلصات (DM-CR-5)، والقديم من غير رقم: ترتيبه في العقد
export const certificateDocNo = (x) =>
  x?.number != null ? formatDocNo("constructionCertificate", x.number, x.docCode) : String(x?.seq ?? "");

// فاتورة مقاولات: العقد والمشروع + رقم المستخلص (أو الدفعة المقدمة) للطباعة
// حقول العقد والمستخلص اللي بتطلع على الفاتورة المطبوعة (getSale / getPurchase)
export const CONTRACT_PRINT_SELECT = {
  number: true,
  docCode: true,
  isDirect: true,
  projectName: true,
  refNo: true,
  totalAmount: true,
  advancePct: true,
  advanceAmount: true,
  recoveryPct: true,
  retentionPct: true,
};
export const CERT_PRINT_SELECT = {
  seq: true,
  number: true,
  docCode: true,
  isFinal: true,
  periodFrom: true,
  periodTo: true,
  gross: true,
  recovery: true,
  taxRate: true,
  taxAmount: true,
  invoiceTotal: true,
  retention: true,
  penalty: true,
  netPayable: true,
  clientRef: true,
  contract: { select: CONTRACT_PRINT_SELECT },
};

export function contractingPrintInfo(doc) {
  const cert = doc.constructionCertificate;
  const c = cert?.contract ?? doc.constructionAdvance;
  if (!c) return null;
  const num = (v) => Number(v ?? 0);
  return {
    contractNo: formatDocNo("constructionContract", c.number, c.docCode),
    // المستخلص السريع (من غير عقد): من غير رقم عقد ولا مشروع، وبرقمه عند العميل
    isDirect: Boolean(c.isDirect),
    clientRef: cert?.clientRef ?? null,
    refNo: c.refNo,
    projectName: c.projectName,
    certNo: cert ? certificateDocNo(cert) : null,
    isFinal: Boolean(cert?.isFinal),
    advance: !cert,
    periodFrom: cert?.periodFrom ? dbDateToDay(cert.periodFrom) : null,
    periodTo: cert?.periodTo ? dbDateToDay(cert.periodTo) : null,
    // بيانات العقد للتوضيح على الفاتورة (مش بتروح للهيئة)
    contractTotal: num(c.totalAmount),
    advancePct: num(c.advancePct),
    advanceAmount: num(c.advanceAmount),
    recoveryPct: num(c.recoveryPct),
    retentionPct: num(c.retentionPct),
    // ملخص المستخلص: الأعمال - الاسترداد + الضريبة = الفاتورة - الضمان - الغرامة = الصافي
    cert: cert
      ? {
          gross: num(cert.gross),
          recovery: num(cert.recovery),
          taxRate: num(cert.taxRate),
          taxAmount: num(cert.taxAmount),
          invoiceTotal: num(cert.invoiceTotal),
          retention: num(cert.retention),
          penalty: num(cert.penalty),
          netPayable: num(cert.netPayable),
        }
      : null,
  };
}
