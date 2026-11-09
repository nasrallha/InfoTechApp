import "server-only";
import { listCompanyCodes, multiTenant, runWithCompany } from "@/lib/tenant";
import { tenantKey } from "@/lib/tenant-state";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { round } from "@/lib/invoice-calc";
import { dayEnd, dayStart } from "@/lib/dates";
import { saleDocNo } from "@/lib/doc-number";
import { zatcaGateway } from "@/lib/zatca-gateway";
import { decryptSecret } from "@/lib/secret-box";
import { buyerMissing, isB2BCustomer, productTax } from "@/lib/zatca-tax";
import { probeGateway } from "@/lib/zatca-gateway-launcher";
import { getCompany } from "./company.service";
import { FIRST_PIH, sellerParty } from "./zatca.service";

// ============================================================
// الفواتير الإلكترونية: توقيع فواتير البيع والمرتجعات وإرسالها للهيئة
// - التوقيع وقت الحفظ: ICV + PIH من وحدة الفرع (بقفل على الصف عشان الترتيب)
// - المبسطة: إرسال فوري (لو مفعّل) أو من الطابور في الخلفية
// - الضريبية: اعتماد من الهيئة وقت الحفظ (والطباعة بعد الاعتماد)
// - الطابور (runZatcaQueue): يوقّع اللي متوقعش (لو الخدمة كانت واقفة)
//   ويبعت المعلّق ويعيد المحاولة في أخطاء الاتصال
// ============================================================

const SETTINGS_ID = 1;
const ACCEPTED = ["reported", "cleared"];
const OPEN = ["pending", "error"];
const OVERDUE_HOURS = 20; // تنبيه قبل مهلة الـ 24 ساعة للمبسطة
const n = (v) => (v == null ? 0 : Number(v));
const R2 = (v) => round(v, 2);
const toB64 = (text) => Buffer.from(text, "utf8").toString("base64");
const fromB64 = (b64) => Buffer.from(b64, "base64").toString("utf8");

// ------------------------------------------------------------
// الإعدادات
// ------------------------------------------------------------
export async function getZatcaSettings() {
  return prisma.zatcaSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
    select: {
      sendOnSave: true,
      autoSend: true,
      intervalMinutes: true,
      alertTime: true,
      alertThreshold: true,
    },
  });
}

export async function saveZatcaSettings(data) {
  await prisma.zatcaSettings.upsert({
    where: { id: SETTINGS_ID },
    update: data,
    create: { id: SETTINGS_ID, ...data },
  });
  return getZatcaSettings();
}

// حالة الربط للفرع (لشاشات البيع)
export async function getBranchZatcaInfo(branchId) {
  const unit = await prisma.zatcaUnit.findUnique({
    where: { branchId },
    select: { status: true, environment: true },
  });
  if (unit?.status !== "active") return { active: false };
  const settings = await getZatcaSettings();
  return {
    active: true,
    environment: unit.environment,
    sendOnSave: settings.sendOnSave,
  };
}

// ------------------------------------------------------------
// تحويل الفاتورة لبيانات الهيئة (المبالغ قبل الضريبة)
// ------------------------------------------------------------
function riyadhParts(date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(date))
      .map((x) => [x.type, x.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
  };
}

// كود طريقة الدفع حسب الهيئة (UN/ECE 4461)
const PAYMENT_CODE = {
  cash: "10",
  card: "48",
  wallet: "48",
  transfer: "42",
  credit: "30",
};

function paymentMeansCode(sale) {
  if (n(sale.remainingAmount) > 0.004 && !(n(sale.paidAmount) > 0)) return "30";
  const biggest = [...(sale.payments ?? [])].sort(
    (a, b) => n(b.amount) - n(a.amount),
  )[0];
  return PAYMENT_CODE[biggest?.paymentMethod?.type] ?? "10";
}

const saleForZatcaSelect = {
  id: true,
  type: true,
  number: true,
  date: true,
  createdAt: true,
  branchId: true,
  notes: true,
  customerArName: true,
  customerEnName: true,
  customerTaxNo: true,
  isExport: true,
  totalAmount: true,
  paidAmount: true,
  remainingAmount: true,
  branch: {
    select: {
      id: true,
      idScheme: true,
      registrationNo: true,
      phone: true,
      city: true,
      district: true,
      street: true,
      buildingNo: true,
      additionalNo: true,
      postalCode: true,
    },
  },
  customer: {
    select: {
      arName: true,
      enName: true,
      taxNo: true,
      registrationNo: true,
      city: true,
      district: true,
      street: true,
      buildingNo: true,
      additionalNo: true,
      postalCode: true,
      countryCode: true,
      idScheme: true,
      idNumber: true,
    },
  },
  returnOf: {
    select: {
      type: true,
      number: true,
      isExport: true,
      zatcaDocument: { select: { kind: true } },
    },
  },
  items: {
    orderBy: { id: "asc" },
    select: {
      arName: true,
      qty: true,
      price: true,
      priceIncludesTax: true,
      taxRate: true,
      taxCategory: true,
      taxExemptionCode: true,
      taxExemptionReason: true,
      netAmount: true,
      taxAmount: true,
    },
  },
  payments: {
    select: { amount: true, paymentMethod: { select: { type: true } } },
  },
  zatcaDocument: { select: { id: true } },
};

// نوع الفاتورة: التصدير أو عميل شركة بياناته كاملة = ضريبية، غير كده مبسطة
// (المرتجع بياخد نوع الفاتورة الأصلية)
function kindOf(sale) {
  if (sale.type === "return" && sale.returnOf?.zatcaDocument?.kind)
    return sale.returnOf.zatcaDocument.kind;
  if (isExportSale(sale)) return "standard";
  const c = sale.customer;
  return c && isB2BCustomer(c) && !buyerMissing(c).length
    ? "standard"
    : "simplified";
}

// فاتورة تصدير (أو مرتجع فاتورة تصدير)
const isExportSale = (sale) =>
  Boolean(sale.isExport || (sale.type === "return" && sale.returnOf?.isExport));

// معرّف المشتري: النوع المختار في بيانات العميل، أو السجل التجاري القديم
function buyerId(c) {
  if (c.idScheme && c.idNumber)
    return { idScheme: c.idScheme, idValue: c.idNumber };
  if (c.registrationNo) return { idScheme: "CRN", idValue: c.registrationNo };
  return { idScheme: null, idValue: null };
}

function buyerOf(sale, kind) {
  const c = sale.customer;
  const name = sale.customerArName || c?.arName;
  if (kind !== "standard" || !c) return name ? { name } : null;
  const exporting = isExportSale(sale);
  return {
    name,
    // التصدير: من غير رقم ضريبي سعودي (العميل برّه المملكة)
    vatNumber: exporting ? null : c.taxNo || null,
    ...buyerId(c),
    address: {
      street: c.street,
      buildingNumber: c.buildingNo,
      additionalNumber: c.additionalNo,
      district: c.district,
      city: c.city,
      postalCode: c.postalCode,
      countryCode: c.countryCode || "SA",
    },
  };
}

function lineOf(it) {
  const qty = n(it.qty);
  const rate = n(it.taxRate);
  const price = n(it.price);
  // سعر الوحدة قبل الضريبة (لو السعر شامل نشيلها منه)
  const unitPrice = it.priceIncludesTax ? price / (1 + rate / 100) : price;
  const net = R2(n(it.netAmount));
  const discount = Math.max(0, R2(qty * unitPrice) - net);
  const tax = productTax({
    taxRate: rate,
    taxCategory: it.taxCategory,
    taxExemptionCode: it.taxExemptionCode,
    taxExemptionReason: it.taxExemptionReason,
  });
  return {
    name: it.arName,
    quantity: qty,
    unitCode: "PCE",
    unitPrice: round(unitPrice, 6),
    discount: R2(discount),
    taxCategory: tax.taxCategory,
    taxPercent: tax.taxCategory === "S" ? rate : 0,
    exemptionReasonCode: tax.taxExemptionCode,
    exemptionReason: tax.taxExemptionReason,
    netAmount: net,
    taxAmount: R2(n(it.taxAmount)),
  };
}

export function buildInvoiceDto(sale, { company, icv, pih, uuid, kind }) {
  const { date, time } = riyadhParts(sale.date);
  const isReturn = sale.type === "return";
  return {
    id: saleDocNo(sale.type, sale.number),
    uuid,
    issueDate: date,
    issueTime: time,
    kind,
    documentType: isReturn ? "credit" : "invoice",
    icv,
    pih,
    currency: "SAR",
    paymentMeansCode: paymentMeansCode(sale),
    billingReference: isReturn
      ? saleDocNo(sale.returnOf?.type ?? "sale", sale.returnOf?.number)
      : null,
    reason: isReturn
      ? sale.notes?.trim() || "Returned goods | مرتجع بضاعة"
      : null,
    seller: sellerParty(company, sale.branch),
    buyer: buyerOf(sale, kind),
    // علامة التصدير في نوع الفاتورة (0100100)
    flags: isExportSale(sale) ? { exports: true } : null,
    lines: sale.items.map(lineOf),
    payableAmount: R2(n(sale.totalAmount)),
  };
}

// ------------------------------------------------------------
// التوقيع
// ------------------------------------------------------------
async function activeUnit(branchId) {
  const unit = await prisma.zatcaUnit.findUnique({ where: { branchId } });
  return unit?.status === "active" ? unit : null;
}

// يوقّع فاتورة (لو فرعها مربوط ولسه متوقعتش). يرجع المستند أو null
export async function signSale(saleId) {
  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: saleForZatcaSelect,
  });
  if (!sale) return null;
  if (sale.zatcaDocument)
    return prisma.zatcaDocument.findUnique({ where: { saleId } });

  const unit = await activeUnit(sale.branchId);
  if (!unit) return null;
  // الفواتير اللي قبل التسجيل مع الهيئة مبتتوقعش
  if (unit.onboardedAt && sale.createdAt < unit.onboardedAt) return null;

  const company = await getCompany();
  const credentials = {
    certificate: unit.productionCertificate,
    privateKey: decryptSecret(unit.privateKeyEnc),
  };
  const kind = kindOf(sale);

  // القفل على صف الوحدة: فاتورة واحدة بتاخد رقم في السلسلة في نفس اللحظة
  return prisma.$transaction(
    async (tx) => {
      const rows =
        await tx.$queryRaw`SELECT icv, lastHash FROM zatca_units WHERE id = ${unit.id} FOR UPDATE`;
      const exists = await tx.zatcaDocument.findUnique({
        where: { saleId },
      });
      if (exists) return exists;

      const icv = Number(rows[0]?.icv ?? 0) + 1;
      const pih = rows[0]?.lastHash || FIRST_PIH;
      const uuid = randomUUID();
      const invoice = buildInvoiceDto(sale, { company, icv, pih, uuid, kind });
      const signed = await zatcaGateway.signInvoice(invoice, credentials);

      await tx.zatcaUnit.update({
        where: { id: unit.id },
        data: { icv, lastHash: signed.hash },
      });
      return tx.zatcaDocument.create({
        data: {
          saleId,
          unitId: unit.id,
          branchId: sale.branchId,
          environment: unit.environment,
          kind,
          docType: invoice.documentType,
          icv,
          uuid: signed.uuid || uuid,
          pih,
          hash: signed.hash,
          qr: signed.qr,
          signedXml: fromB64(signed.xml),
          status: "pending",
        },
      });
    },
    { maxWait: 15000, timeout: 60000 },
  );
}

// ------------------------------------------------------------
// الإرسال (إبلاغ للمبسطة / اعتماد للضريبية)
// ------------------------------------------------------------
export async function submitDocument(docId) {
  // حجز المستند (عشان ميتبعتش مرتين في نفس اللحظة)
  const now = new Date();
  const { count } = await prisma.zatcaDocument.updateMany({
    where: {
      id: docId,
      status: { in: OPEN },
      OR: [
        { lastAttemptAt: null },
        { lastAttemptAt: { lt: new Date(now.getTime() - 30_000) } },
      ],
    },
    data: { lastAttemptAt: now, attempts: { increment: 1 } },
  });
  const doc = await prisma.zatcaDocument.findUnique({
    where: { id: docId },
    include: { unit: true },
  });
  if (!count) return doc;

  const credentials = {
    certificate: doc.unit.productionCertificate,
    secret: decryptSecret(doc.unit.productionSecretEnc),
  };
  let res;
  try {
    res = await zatcaGateway.submitInvoice({
      environment: doc.environment,
      mode: doc.kind === "standard" ? "clearance" : "reporting",
      xml: toB64(doc.signedXml),
      credentials,
    });
  } catch (error) {
    // الخدمة واقفة أو مفيش إنترنت: نعيد المحاولة بعدين
    return prisma.zatcaDocument.update({
      where: { id: docId },
      data: {
        status: "error",
        zatcaStatus: "GATEWAY_ERROR",
        errors: [
          { code: error?.code ?? null, message: error?.message ?? null },
        ],
      },
    });
  }

  const status = res.accepted
    ? doc.kind === "standard"
      ? "cleared"
      : "reported"
    : res.retryable
      ? "error"
      : "rejected";

  const clearedXml =
    res.accepted && res.clearedXml ? fromB64(res.clearedXml) : null;
  return prisma.zatcaDocument.update({
    where: { id: docId },
    data: {
      status,
      zatcaStatus: res.status ?? null,
      httpStatus: res.httpStatus ?? null,
      warnings: res.warnings ?? [],
      errors: res.errors ?? [],
      ...(res.accepted ? { acceptedAt: new Date() } : {}),
      ...(clearedXml ? { clearedXml } : {}),
      // الضريبية: الـ QR الرسمي هو اللي في الـ XML المعتمد
      ...(res.accepted && res.qr ? { qr: res.qr } : {}),
    },
  });
}

// ملخص للشاشة بعد الحفظ
const summary = (doc, extra = {}) =>
  doc
    ? {
        status: doc.status,
        kind: doc.kind,
        icv: doc.icv,
        zatcaStatus: doc.zatcaStatus,
        errors: doc.errors ?? [],
        warnings: doc.warnings ?? [],
        ...extra,
      }
    : null;

// بعد حفظ فاتورة / مرتجع: توقيع، وإرسال (حسب الإعدادات أو اختيار المستخدم)
// background: الكاشير (منستناش رد الهيئة عشان الدفع يبقى سريع)
export async function afterSaleSaved(
  saleId,
  { send, background = false } = {},
) {
  let doc;
  try {
    doc = await signSale(saleId);
  } catch (error) {
    console.error("[zatca] sign failed:", error?.code ?? error?.message);
    ensureZatcaWorker();
    const unit = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { branchId: true },
    });
    return (await activeUnit(unit?.branchId))
      ? { status: "unsigned", error: error?.code ?? "UnexpectedError" }
      : null;
  }
  if (!doc) return null;
  ensureZatcaWorker();

  const settings = await getZatcaSettings();
  const shouldSend =
    doc.kind === "standard" || (send ?? settings.sendOnSave) === true;
  if (!shouldSend) return summary(doc);

  if (background && doc.kind !== "standard") {
    submitDocument(doc.id).catch((e) =>
      console.error("[zatca] submit failed:", e?.message ?? e),
    );
    return summary(doc, { sending: true });
  }
  return summary(await submitDocument(doc.id));
}

export async function isSaleSigned(saleId) {
  const doc = await prisma.zatcaDocument.findUnique({
    where: { saleId },
    select: { id: true },
  });
  return Boolean(doc);
}

// الفاتورة اتوقعت؟ (مقفولة: لا تعديل ولا حذف)
// ------------------------------------------------------------
// البرنامج "شغال على الإنتاج": فاتورة واحدة على الأقل اتبعتت فعلاً للهيئة
// على بيئة الإنتاج (الهيئة ردّت: اتقبلت / اتعمدت / اترفضت، أو رجع أي رد)
// من ساعتها: ممنوع حذف أي فاتورة بيع أو مرتجع (موقّعة أو لأ)، من الشاشة أو من التصفير
// ------------------------------------------------------------
export const SENT_PRODUCTION = {
  environment: "production",
  OR: [
    { status: { in: ["reported", "cleared", "rejected"] } },
    { httpStatus: { not: null } },
  ],
};

export async function isProductionLive(db = prisma) {
  return (await db.zatcaDocument.count({ where: SENT_PRODUCTION })) > 0;
}

export async function assertNotProductionLive(db = prisma) {
  if (await isProductionLive(db)) throw new AppError("ZatcaProductionNoDelete");
}

export async function assertNotSigned(db, saleId) {
  const doc = await db.zatcaDocument.findUnique({
    where: { saleId },
    select: { id: true },
  });
  if (doc) throw new AppError("ZatcaInvoiceLocked");
}

// ------------------------------------------------------------
// الطابور في الخلفية
// ------------------------------------------------------------
// running / lastRun لكل شركة لوحدها (وضع الشركات)، و "_" للقاعدة الواحدة
const worker = (globalThis.__zatcaWorker ??= {
  timer: null,
  running: new Set(),
  lastRun: new Map(),
});
if (!(worker.running instanceof Set)) worker.running = new Set();
if (!(worker.lastRun instanceof Map)) worker.lastRun = new Map();

export async function runZatcaQueue({ force = false } = {}) {
  const key = await tenantKey();
  if (worker.running.has(key)) return { skipped: true };
  worker.running.add(key);
  const result = { signed: 0, sent: 0, failed: 0 };
  try {
    const units = await prisma.zatcaUnit.findMany({
      where: { status: "active" },
      select: { id: true, branchId: true, onboardedAt: true },
    });

    // 1) فواتير متوقعتش (الخدمة كانت واقفة وقت الحفظ)
    for (const u of units) {
      const sales = await prisma.sale.findMany({
        where: {
          branchId: u.branchId,
          zatcaDocument: { is: null },
          ...(u.onboardedAt ? { createdAt: { gte: u.onboardedAt } } : {}),
        },
        orderBy: { id: "asc" },
        take: 100,
        select: { id: true },
      });
      for (const s of sales) {
        try {
          if (await signSale(s.id)) result.signed++;
        } catch {
          result.failed++;
          break; // الخدمة لسه واقفة غالباً
        }
      }
    }

    // 2) الإرسال (المعلّق لو الإرسال التلقائي شغال + إعادة محاولة أخطاء الاتصال)
    const settings = await getZatcaSettings();
    const docs = await prisma.zatcaDocument.findMany({
      where: {
        unit: { status: "active" },
        OR: [
          ...(settings.autoSend || force ? [{ status: "pending" }] : []),
          { status: "error", attempts: { lt: 50 } },
        ],
      },
      orderBy: [{ unitId: "asc" }, { icv: "asc" }],
      take: 200,
      select: { id: true },
    });
    for (const d of docs) {
      const doc = await submitDocument(d.id);
      if (ACCEPTED.includes(doc?.status)) result.sent++;
      else result.failed++;
    }
  } finally {
    worker.running.delete(key);
    worker.lastRun.set(key, Date.now());
  }
  return result;
}

// تشغيل الطابور كل دقيقة (وبينفّذ فعلياً كل intervalMinutes من إعدادات كل شركة)
// وضع الشركات: بيلف على الشركات واحدة واحدة، كل شركة بإعدادات الزكاة بتاعتها
async function zatcaTickOne(key) {
  const settings = await getZatcaSettings();
  const every = Math.max(1, settings.intervalMinutes) * 60_000;
  if (Date.now() - (worker.lastRun.get(key) ?? 0) < every) return;
  await runZatcaQueue();
}

export function ensureZatcaWorker() {
  if (worker.timer) return;
  worker.timer = setInterval(async () => {
    if (!multiTenant()) {
      try {
        await zatcaTickOne("_");
      } catch (error) {
        console.error("[zatca] queue:", error?.message ?? error);
      }
      return;
    }
    let codes = [];
    try {
      codes = await listCompanyCodes();
    } catch (error) {
      console.error("[zatca] companies:", error?.message ?? error);
    }
    for (const code of codes) {
      try {
        await runWithCompany(code, async () => {
          // شركة مش مربوطة بالزكاة: مفيش حاجة تتعمل
          const units = await prisma.zatcaUnit.count({
            where: { status: "active" },
          });
          if (units) await zatcaTickOne(code);
        });
      } catch (error) {
        console.error(`[zatca] queue (${code}):`, error?.message ?? error);
      }
    }
  }, 60_000);
  worker.timer.unref?.();
}

// ------------------------------------------------------------
// المتابعة والتقارير
// ------------------------------------------------------------
const scopeOf = (user, branchId) =>
  can(user, "allBranches.view")
    ? branchId
      ? { branchId }
      : {}
    : { branchId: user.branch.id };

export async function listZatcaDocuments(filters, user) {
  const where = {
    ...scopeOf(user, filters.branchId),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(filters.docType ? { docType: filters.docType } : {}),
    sale: {
      date: { gte: dayStart(filters.from), lte: dayEnd(filters.to) },
    },
  };
  const rows = await prisma.zatcaDocument.findMany({
    where,
    orderBy: [{ id: "desc" }],
    take: 2000,
    select: {
      id: true,
      saleId: true,
      environment: true,
      kind: true,
      docType: true,
      icv: true,
      status: true,
      zatcaStatus: true,
      warnings: true,
      errors: true,
      attempts: true,
      acceptedAt: true,
      createdAt: true,
      sale: {
        select: {
          type: true,
          number: true,
          date: true,
          customerArName: true,
          customerEnName: true,
          netAmount: true,
          taxAmount: true,
          totalAmount: true,
          branch: { select: { arName: true, enName: true } },
        },
      },
    },
  });

  const list = rows.map((d) => {
    const sign = d.sale.type === "return" ? -1 : 1;
    return {
      id: d.id,
      saleId: d.saleId,
      docNo: saleDocNo(d.sale.type, d.sale.number),
      saleType: d.sale.type,
      date: d.sale.date,
      customer: d.sale.customerArName
        ? { arName: d.sale.customerArName, enName: d.sale.customerEnName }
        : null,
      branch: d.sale.branch,
      environment: d.environment,
      kind: d.kind,
      docType: d.docType,
      icv: d.icv,
      status: d.status,
      zatcaStatus: d.zatcaStatus,
      warnings: d.warnings ?? [],
      errors: d.errors ?? [],
      attempts: d.attempts,
      acceptedAt: d.acceptedAt,
      net: sign * n(d.sale.netAmount),
      tax: sign * n(d.sale.taxAmount),
      total: sign * n(d.sale.totalAmount),
    };
  });

  // ملخص لكل حالة
  const byStatus = {};
  for (const r of list) {
    const s = (byStatus[r.status] ??= { count: 0, net: 0, tax: 0, total: 0 });
    s.count++;
    s.net += r.net;
    s.tax += r.tax;
    s.total += r.total;
  }
  for (const s of Object.values(byStatus)) {
    s.net = R2(s.net);
    s.tax = R2(s.tax);
    s.total = R2(s.total);
  }
  const accepted = list.filter((r) => ACCEPTED.includes(r.status));
  return {
    rows: list,
    byStatus,
    totals: {
      count: list.length,
      acceptedCount: accepted.length,
      net: R2(accepted.reduce((s, r) => s + r.net, 0)),
      tax: R2(accepted.reduce((s, r) => s + r.tax, 0)),
      total: R2(accepted.reduce((s, r) => s + r.total, 0)),
    },
    unsigned: await countUnsigned(user, filters.branchId),
  };
}

async function countUnsigned(user, branchId) {
  const units = await prisma.zatcaUnit.findMany({
    where: { status: "active", ...scopeOf(user, branchId) },
    select: { branchId: true, onboardedAt: true },
  });
  let total = 0;
  for (const u of units) {
    total += await prisma.sale.count({
      where: {
        branchId: u.branchId,
        zatcaDocument: { is: null },
        ...(u.onboardedAt ? { createdAt: { gte: u.onboardedAt } } : {}),
      },
    });
  }
  return total;
}

// الإشعارات (الجرس + الصفحة الرئيسية)
export async function getZatcaAlerts(user) {
  const scope = scopeOf(user, null);
  const overdueBefore = new Date(Date.now() - OVERDUE_HOURS * 3600_000);
  const [pending, errors, rejected, overdue, unsigned, units, settings, gw] =
    await Promise.all([
      prisma.zatcaDocument.count({ where: { ...scope, status: "pending" } }),
      prisma.zatcaDocument.count({ where: { ...scope, status: "error" } }),
      prisma.zatcaDocument.count({ where: { ...scope, status: "rejected" } }),
      prisma.zatcaDocument.count({
        where: {
          ...scope,
          kind: "simplified",
          status: { in: OPEN },
          createdAt: { lt: overdueBefore },
        },
      }),
      countUnsigned(user, null),
      prisma.zatcaUnit.findMany({
        where: { status: "active", ...scope },
        select: {
          certExpiresAt: true,
          branch: { select: { arName: true, enName: true } },
        },
      }),
      getZatcaSettings(),
      probeGateway(),
    ]);
  if (units.length) ensureZatcaWorker();
  const expiring = units
    .filter((u) => u.certExpiresAt)
    .map((u) => ({
      branch: u.branch,
      days: Math.floor((u.certExpiresAt.getTime() - Date.now()) / 86400000),
    }))
    .filter((u) => u.days <= 30);
  return {
    enabled: units.length > 0,
    pending,
    errors,
    rejected,
    overdue,
    unsigned,
    expiring,
    gatewayOnline: Boolean(gw.online && gw.authorized),
    alertTime: settings.alertTime,
    alertThreshold: settings.alertThreshold,
  };
}

// الـ XML الرسمي للتنزيل (المعتمد للضريبية، الموقّع للمبسطة)
export async function getDocumentXml(saleId, user) {
  const doc = await prisma.zatcaDocument.findFirst({
    where: { saleId, ...scopeOf(user, null) },
    select: {
      signedXml: true,
      clearedXml: true,
      uuid: true,
      sale: { select: { type: true, number: true } },
    },
  });
  if (!doc) throw new AppError("ZatcaDocumentNotFound");
  return {
    fileName: `${saleDocNo(doc.sale.type, doc.sale.number)}_${doc.uuid}.xml`,
    xml: doc.clearedXml || doc.signedXml,
  };
}

// إرسال يدوي: فاتورة واحدة (وتوقيعها لو متوقعتش) أو كل المعلّق
export async function sendSaleNow(saleId, user) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, ...scopeOf(user, null) },
    select: { id: true },
  });
  if (!sale) throw new AppError("SaleNotFound");
  const doc = await signSale(saleId);
  if (!doc) throw new AppError("ZatcaNotActive");
  if (ACCEPTED.includes(doc.status)) return summary(doc);
  // المرفوضة بنعيد إرسالها بس بطلب يدوي
  if (doc.status === "rejected")
    await prisma.zatcaDocument.update({
      where: { id: doc.id },
      data: { status: "error", lastAttemptAt: null },
    });
  return summary(await submitDocument(doc.id));
}

export async function sendAllPending() {
  return runZatcaQueue({ force: true });
}
