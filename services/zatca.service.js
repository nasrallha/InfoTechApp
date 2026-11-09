import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { zatcaGateway } from "@/lib/zatca-gateway";
import {
  decryptSecret,
  encryptSecret,
  masterKeySource,
} from "@/lib/secret-box";
import {
  ensureGateway,
  launcherStatus,
  probeGateway,
} from "@/lib/zatca-gateway-launcher";
import { documentInfo } from "@/lib/branch-info";
import { idValid } from "@/lib/zatca-tax";
import { getCompany } from "./company.service";

// ============================================================
// الربط مع الزكاة: تسجيل وحدات الربط (EGS) - وحدة لكل فرع
// الخطوات: البيانات → CSR → OTP (شهادة الامتثال) → فحص الامتثال → شهادة الإنتاج
// كل الشغل التقني (المفاتيح، التوقيع، الاتصال بالهيئة) في خدمة ZATCA Gateway
// والأسرار بتتخزن هنا متشفرة (lib/secret-box) ومبتوصلش للمتصفح أبداً
// ============================================================

// هاش "0" (أول فاتورة في السلسلة)
export const FIRST_PIH =
  "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";

export const ZATCA_ENVIRONMENTS = ["developer", "simulation", "production"];

// الحالات اللي البيانات فيها لسه تتعدل (بعدها لازم إعادة ضبط)
const EDITABLE = ["draft", "csr"];

const unitSelect = {
  id: true,
  branchId: true,
  environment: true,
  status: true,
  commonName: true,
  organizationUnitName: true,
  invoiceType: true,
  locationAddress: true,
  industry: true,
  serialNumber: true,
  csr: true,
  complianceRequestId: true,
  complianceChecks: true,
  certSerial: true,
  certIssuedAt: true,
  certExpiresAt: true,
  onboardedAt: true,
  icv: true,
  updatedAt: true,
  logs: {
    orderBy: { id: "desc" },
    take: 20,
    select: {
      id: true,
      action: true,
      environment: true,
      success: true,
      message: true,
      userName: true,
      createdAt: true,
    },
  },
};

const branchSelect = {
  id: true,
  arName: true,
  enName: true,
  isActive: true,
  idScheme: true,
  registrationNo: true,
  phone: true,
  city: true,
  district: true,
  street: true,
  buildingNo: true,
  additionalNo: true,
  postalCode: true,
};

// الوحدة للشاشة (بدون أي أسرار)
function toPublic(u) {
  if (!u) return null;
  const { csr, ...rest } = u;
  const days = u.certExpiresAt
    ? Math.floor((new Date(u.certExpiresAt).getTime() - Date.now()) / 86400000)
    : null;
  return { ...rest, hasCsr: Boolean(csr), certDaysRemaining: days };
}

// ------------------------------------------------------------
// بيانات البائع (من الشركة + الفرع)
// ------------------------------------------------------------
function sellerId(company, info, branch) {
  // الفرع ليه معرّف بنوع غير السجل التجاري (رقم موحد...) ← هو
  if (branch?.registrationNo && branch.idScheme && branch.idScheme !== "CRN")
    return { idScheme: branch.idScheme, idValue: branch.registrationNo };
  const scheme = company?.sellerIdScheme || "CRN";
  return scheme === "CRN"
    ? { idScheme: "CRN", idValue: info.registrationNo ?? "" }
    : { idScheme: scheme, idValue: company?.sellerIdNumber ?? "" };
}

export function sellerParty(company, branch) {
  const info = documentInfo(company, branch);
  const a = info.address ?? {};
  return {
    name: company?.arName ?? "",
    vatNumber: company?.taxNo ?? "",
    // معرّف البائع: السجل التجاري (من الفرع أو الشركة)، أو النوع المختار في بيانات الشركة
    ...sellerId(company, info, branch),
    address: {
      street: a.street ?? "",
      buildingNumber: a.buildingNo ?? "",
      additionalNumber: a.additionalNo ?? "",
      district: a.district ?? "",
      city: a.city ?? "",
      postalCode: a.postalCode ?? "",
      countryCode: "SA",
    },
  };
}

// البيانات الناقصة أو الغلط قبل التسجيل (مفاتيح ترجمة في Zatca.missing)
function missingFields(seller) {
  const m = [];
  const a = seller.address;
  if (!seller.name) m.push("companyName");
  if (!/^3\d{13}3$/.test(seller.vatNumber)) m.push("taxNo");
  if (!idValid(seller.idScheme, seller.idValue))
    m.push(seller.idScheme === "CRN" ? "registrationNo" : "sellerId");
  if (!a.street) m.push("street");
  if (!/^\d{4}$/.test(a.buildingNumber)) m.push("buildingNo");
  if (!a.district) m.push("district");
  if (!a.city) m.push("city");
  if (!/^\d{5}$/.test(a.postalCode)) m.push("postalCode");
  return m;
}

// حالة الخدمة (ولو واقفة: نبدأ تشغيلها في الخلفية من غير ما نستنى)
async function gatewayHealth() {
  const p = await probeGateway();
  const online = Boolean(p.online && p.authorized);
  if (!online) ensureGateway({ wait: false });
  const status = launcherStatus();
  return {
    online,
    starting: status.starting || (!online && status.autoStart && !status.error),
    error: p.online && !p.authorized ? "KeyMismatch" : status.error,
    autoStart: status.autoStart,
    sdkVersion: p.sdkVersion ?? null,
    rulesFound: p.rulesFound ?? null,
    os: p.os ?? null,
  };
}

// تشغيل الخدمة يدوياً من الشاشة (ونستنى لحد ما تشتغل)
export async function startZatcaGateway() {
  await ensureGateway({ wait: true });
  return gatewayHealth();
}

// ------------------------------------------------------------
// الشاشة: حالة الخدمة + كل الفروع ووحداتها
// ------------------------------------------------------------
export async function getZatcaOverview() {
  const [company, branches, gateway] = await Promise.all([
    getCompany(),
    prisma.branch.findMany({
      orderBy: { id: "asc" },
      select: { ...branchSelect, zatcaUnit: { select: unitSelect } },
    }),
    gatewayHealth(),
  ]);

  return {
    gateway,
    config: { masterKeySource: masterKeySource() },
    company: company
      ? { arName: company.arName, enName: company.enName, taxNo: company.taxNo }
      : null,
    branches: branches.map(({ zatcaUnit, ...b }) => {
      const seller = sellerParty(company, b);
      return {
        id: b.id,
        arName: b.arName,
        enName: b.enName,
        isActive: b.isActive,
        seller,
        missing: missingFields(seller),
        unit: toPublic(zatcaUnit),
      };
    }),
  };
}

// ------------------------------------------------------------
// أدوات داخلية
// ------------------------------------------------------------
async function loadContext(branchId) {
  const [company, branch] = await Promise.all([
    getCompany(),
    prisma.branch.findUnique({
      where: { id: branchId },
      select: { ...branchSelect, zatcaUnit: true },
    }),
  ]);
  if (!branch) throw new AppError("BranchNotFound");
  const seller = sellerParty(company, branch);
  return { company, branch, seller, unit: branch.zatcaUnit };
}

function requireUnit(unit, statuses) {
  if (!unit) throw new AppError("ZatcaUnitNotFound");
  if (statuses && !statuses.includes(unit.status))
    throw new AppError("ZatcaWrongStep");
  return unit;
}

function requireSeller(seller) {
  const missing = missingFields(seller);
  if (missing.length) throw new AppError("ZatcaSellerIncomplete", { missing });
}

const userName = (user) =>
  user?.arFullname || user?.enFullname || user?.username || null;

async function log(
  unit,
  action,
  user,
  success,
  message = null,
  details = null,
) {
  try {
    await prisma.zatcaLog.create({
      data: {
        unitId: unit.id,
        action,
        environment: unit.environment,
        success,
        message: message ? String(message).slice(0, 1000) : null,
        details: details ?? undefined,
        userId: user?.id ?? null,
        userName: userName(user),
      },
    });
  } catch (error) {
    console.error("[zatca] log failed:", error?.message ?? error);
  }
}

// تنفيذ خطوة مع تسجيلها في السجل (نجاح أو فشل)
async function step(unit, action, user, fn) {
  try {
    const result = await fn();
    await log(
      unit,
      action,
      user,
      result?.logSuccess ?? true,
      result?.logMessage ?? null,
    );
    return result;
  } catch (error) {
    const msg =
      error instanceof AppError
        ? [
            error.code,
            error.details?.message,
            ...(error.details?.messages ?? []).map((m) => m.message),
          ]
            .filter(Boolean)
            .join(" - ")
        : (error?.message ?? String(error));
    await log(
      unit,
      action,
      user,
      false,
      msg,
      error instanceof AppError ? (error.details ?? null) : null,
    );
    throw error;
  }
}

// رد الهيئة بالرفض → خطأ فيه رسائلها
function rejected(res) {
  return new AppError("ZatcaRejected", {
    httpStatus: res?.httpStatus ?? null,
    messages: (res?.errors ?? []).map((e) => ({
      code: e.code ?? null,
      message: e.message ?? null,
    })),
  });
}

// ------------------------------------------------------------
// 1) بيانات الوحدة
// ------------------------------------------------------------
export async function saveZatcaUnit(data, user) {
  const { branch, unit } = await loadContext(data.branchId);
  const values = {
    environment: data.environment,
    commonName: data.commonName,
    organizationUnitName: data.organizationUnitName,
    invoiceType: data.invoiceType,
    locationAddress: data.locationAddress,
    industry: data.industry,
  };

  if (!unit) {
    const created = await prisma.zatcaUnit.create({
      data: { branchId: branch.id, status: "draft", ...values },
    });
    await log(created, "setup", user, true);
    return { id: created.id };
  }

  if (!EDITABLE.includes(unit.status)) throw new AppError("ZatcaUnitLocked");
  const changed = Object.keys(values).some((k) => values[k] !== unit[k]);
  if (!changed) return { id: unit.id };

  // أي تعديل بعد الـ CSR يلغيه (لازم CSR جديد بالبيانات الجديدة)
  const updated = await prisma.zatcaUnit.update({
    where: { id: unit.id },
    data: {
      ...values,
      status: "draft",
      csr: null,
      privateKeyEnc: null,
      serialNumber: null,
    },
  });
  await log(updated, "setup", user, true);
  return { id: unit.id };
}

// ------------------------------------------------------------
// 2) CSR + المفتاح الخاص (بالـ SDK)
// ------------------------------------------------------------
async function newCsr(unit, company) {
  return zatcaGateway.generateCsr({
    environment: unit.environment,
    commonName: unit.commonName,
    organizationIdentifier: company.taxNo,
    organizationUnitName: unit.organizationUnitName,
    organizationName: company.arName,
    countryName: "SA",
    invoiceType: unit.invoiceType,
    locationAddress: unit.locationAddress,
    industryBusinessCategory: unit.industry,
    // الرقم التسلسلي للجهاز (EGS): 1-<اسم الحل>|2-<الإصدار>|3-<UUID بيتولّد لكل وحدة>
    solutionName: "INFOTECH",
    solutionVersion: "V1.0",
  });
}

export async function generateZatcaCsr(branchId, user) {
  const { company, seller, unit } = await loadContext(branchId);
  requireUnit(unit, EDITABLE);
  requireSeller(seller);

  return step(unit, "csr", user, async () => {
    const res = await newCsr(unit, company);
    await prisma.zatcaUnit.update({
      where: { id: unit.id },
      data: {
        status: "csr",
        csr: res.csr,
        privateKeyEnc: encryptSecret(res.privateKey),
        serialNumber: res.serialNumber,
      },
    });
    return { serialNumber: res.serialNumber, logMessage: res.serialNumber };
  });
}

// ------------------------------------------------------------
// 3) OTP → شهادة الامتثال
// ------------------------------------------------------------
export async function requestComplianceCsid(branchId, otp, user) {
  const { unit } = await loadContext(branchId);
  requireUnit(unit, ["csr", "compliance", "checked"]);
  if (!unit.csr) throw new AppError("ZatcaWrongStep");

  return step(unit, "compliance-csid", user, async () => {
    const res = await zatcaGateway.complianceCsid({
      environment: unit.environment,
      csr: unit.csr,
      otp,
    });
    if (!res?.ok) throw rejected(res);
    await prisma.zatcaUnit.update({
      where: { id: unit.id },
      data: {
        status: "compliance",
        complianceRequestId: res.requestId,
        complianceCertificate: res.binarySecurityToken,
        complianceSecretEnc: encryptSecret(res.secret),
        complianceChecks: null,
      },
    });
    return {
      requestId: res.requestId,
      logMessage: `requestID ${res.requestId}`,
    };
  });
}

// ------------------------------------------------------------
// 4) فحص الامتثال: مستند من كل نوع مطلوب حسب نوع الفواتير
// ------------------------------------------------------------
function riyadhNow() {
  const parts = Object.fromEntries(
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
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

// المستندات المطلوبة: الخانة 1 = ضريبية، الخانة 2 = مبسطة
function requiredDocs(invoiceType) {
  const kinds = [];
  if (invoiceType[0] === "1") kinds.push("standard");
  if (invoiceType[1] === "1") kinds.push("simplified");
  return kinds.flatMap((kind) =>
    ["invoice", "credit", "debit"].map((documentType) => ({
      kind,
      documentType,
    })),
  );
}

function sampleInvoice({ kind, documentType, seller, icv, pih, firstId }) {
  const { date, time } = riyadhNow();
  return {
    id: `CMP-${String(icv).padStart(4, "0")}`,
    uuid: randomUUID(),
    issueDate: date,
    issueTime: time,
    kind,
    documentType,
    icv,
    pih,
    currency: "SAR",
    paymentMeansCode: "10",
    billingReference: documentType === "invoice" ? null : firstId,
    reason:
      documentType === "credit"
        ? "Returned goods | مرتجع بضاعة"
        : documentType === "debit"
          ? "Price adjustment | تعديل سعر"
          : null,
    seller,
    buyer:
      kind === "standard"
        ? {
            name: "شركة اختبار الامتثال | Compliance Test Co",
            vatNumber: "399999999800003",
            address: {
              street: "شارع الاختبار",
              buildingNumber: "1111",
              district: "حي الاختبار",
              city: seller.address.city || "الرياض",
              postalCode: "12222",
              countryCode: "SA",
            },
          }
        : null,
    lines: [
      {
        name: "صنف اختبار | Test item",
        quantity: 2,
        unitPrice: 100,
        discount: 10,
        taxCategory: "S",
        taxPercent: 15,
      },
    ],
  };
}

export async function runComplianceChecks(branchId, user) {
  const { seller, unit } = await loadContext(branchId);
  requireUnit(unit, ["compliance", "checked"]);
  requireSeller(seller);

  const credentials = {
    certificate: unit.complianceCertificate,
    secret: decryptSecret(unit.complianceSecretEnc),
    privateKey: decryptSecret(unit.privateKeyEnc),
  };

  return step(unit, "compliance-check", user, async () => {
    const results = [];
    let pih = FIRST_PIH;
    let icv = 1;
    const firstIds = {};

    for (const doc of requiredDocs(unit.invoiceType)) {
      const invoice = sampleInvoice({
        ...doc,
        seller,
        icv,
        pih,
        firstId: firstIds[doc.kind] ?? "CMP-0001",
      });
      if (doc.documentType === "invoice") firstIds[doc.kind] = invoice.id;
      try {
        const res = await zatcaGateway.complianceCheck({
          environment: unit.environment,
          invoice,
          credentials,
        });
        const r = res?.result ?? {};
        results.push({
          ...doc,
          accepted: Boolean(r.accepted),
          status: r.status ?? null,
          httpStatus: r.httpStatus ?? null,
          warnings: (r.warnings ?? []).map((m) => ({
            code: m.code,
            message: m.message,
          })),
          errors: (r.errors ?? []).map((m) => ({
            code: m.code,
            message: m.message,
          })),
        });
        if (res?.signed?.hash) pih = res.signed.hash;
      } catch (error) {
        results.push({
          ...doc,
          accepted: false,
          status: "ERROR",
          httpStatus: null,
          warnings: [],
          errors: gatewayErrors(error),
        });
        // الخدمة واقفة: مفيش فايدة نكمل
        if (error?.code === "ZatcaGatewayUnavailable") break;
      }
      icv++;
    }

    const passed = results.length > 0 && results.every((r) => r.accepted);
    await prisma.zatcaUnit.update({
      where: { id: unit.id },
      data: {
        status: passed ? "checked" : "compliance",
        complianceChecks: { at: new Date().toISOString(), passed, results },
      },
    });
    // الفشل بيرجع للشاشة كنتيجة (مش exception) عشان تظهر تفاصيل كل مستند
    return {
      passed,
      results,
      logSuccess: passed,
      logMessage: `${results.filter((r) => r.accepted).length}/${results.length}`,
    };
  });
}

// خطأ من الخدمة (بيانات ناقصة مثلاً) → رسائل مفهومة لكل حقل
function gatewayErrors(error) {
  const inner = error?.details?.details;
  if (Array.isArray(inner) && inner.length) {
    return inner.map((e) => ({
      code: e?.field ?? null,
      message: e?.message ?? JSON.stringify(e),
    }));
  }
  return [
    {
      code: error?.details?.code ?? error?.code ?? null,
      message: error?.details?.message ?? error?.message ?? null,
    },
  ];
}

// ------------------------------------------------------------
// 5) شهادة الإنتاج
// ------------------------------------------------------------
function certFields(res) {
  const c = res?.certificate;
  return {
    certSerial: c?.serialNumber ?? null,
    certIssuedAt: c?.notBefore ? new Date(c.notBefore) : null,
    certExpiresAt: c?.notAfter ? new Date(c.notAfter) : null,
  };
}

export async function requestProductionCsid(branchId, user) {
  const { unit } = await loadContext(branchId);
  requireUnit(unit, ["checked"]);

  return step(unit, "production-csid", user, async () => {
    const res = await zatcaGateway.productionCsid({
      environment: unit.environment,
      complianceRequestId: unit.complianceRequestId,
      credentials: {
        certificate: unit.complianceCertificate,
        secret: decryptSecret(unit.complianceSecretEnc),
      },
    });
    if (!res?.ok) throw rejected(res);
    await prisma.zatcaUnit.update({
      where: { id: unit.id },
      data: {
        status: "active",
        productionRequestId: res.requestId,
        productionCertificate: res.binarySecurityToken,
        productionSecretEnc: encryptSecret(res.secret),
        ...certFields(res),
        onboardedAt: new Date(),
        // سلسلة فواتير جديدة للوحدة
        icv: 0,
        lastHash: null,
      },
    });
    return {
      requestId: res.requestId,
      logMessage: `requestID ${res.requestId}`,
    };
  });
}

// ------------------------------------------------------------
// 6) تجديد شهادة الإنتاج (CSR ومفتاح جديد + OTP جديد)
//    سلسلة الفواتير بتكمل زي ما هي
// ------------------------------------------------------------
export async function renewProductionCsid(branchId, otp, user) {
  const { company, seller, unit } = await loadContext(branchId);
  requireUnit(unit, ["active"]);
  requireSeller(seller);

  return step(unit, "renew", user, async () => {
    const csr = await newCsr(unit, company);
    const res = await zatcaGateway.renewCsid({
      environment: unit.environment,
      csr: csr.csr,
      otp,
      credentials: {
        certificate: unit.productionCertificate,
        secret: decryptSecret(unit.productionSecretEnc),
      },
    });
    if (!res?.ok) throw rejected(res);
    // نحفظ المفتاح الجديد بس بعد ما الهيئة توافق
    await prisma.zatcaUnit.update({
      where: { id: unit.id },
      data: {
        csr: csr.csr,
        privateKeyEnc: encryptSecret(csr.privateKey),
        serialNumber: csr.serialNumber,
        productionRequestId: res.requestId,
        productionCertificate: res.binarySecurityToken,
        productionSecretEnc: encryptSecret(res.secret),
        ...certFields(res),
      },
    });
    return {
      requestId: res.requestId,
      logMessage: `requestID ${res.requestId}`,
    };
  });
}

// ------------------------------------------------------------
// إعادة ضبط الوحدة: مسح الشهادات والمفاتيح والرجوع للبيانات
// (لتغيير البيئة أو البيانات بعد التسجيل)
// ------------------------------------------------------------
export async function resetZatcaUnit(branchId, user) {
  const { unit } = await loadContext(branchId);
  requireUnit(unit);
  // فيه فواتير لسه متبعتتش بالشهادة الحالية: لازم تتبعت الأول
  const open = await prisma.zatcaDocument.count({
    where: { unitId: unit.id, status: { in: ["pending", "error"] } },
  });
  if (open > 0) throw new AppError("ZatcaUnitHasPending", { count: open });
  await prisma.zatcaUnit.update({
    where: { id: unit.id },
    data: {
      status: "draft",
      serialNumber: null,
      csr: null,
      privateKeyEnc: null,
      complianceRequestId: null,
      complianceCertificate: null,
      complianceSecretEnc: null,
      complianceChecks: null,
      productionRequestId: null,
      productionCertificate: null,
      productionSecretEnc: null,
      certSerial: null,
      certIssuedAt: null,
      certExpiresAt: null,
      onboardedAt: null,
      icv: 0,
      lastHash: null,
    },
  });
  await log(unit, "reset", user, true);
  return { id: unit.id };
}

// اختبار الخدمة (بناء + توقيع + تحقق بدون إنترنت)
export async function testZatcaGateway() {
  const res = await zatcaGateway.selfTest();
  return {
    ok: Boolean(res?.ok),
    sdkVersion: res?.sdkVersion ?? null,
    ms: res?.ms ?? null,
    results: (res?.results ?? []).map((r) => ({
      name: r.name ?? r.Name,
      ok: Boolean(r.ok ?? r.Ok),
      error: r.error ?? r.Error ?? null,
    })),
  };
}

// بيانات الدخول الجاهزة لتوقيع الفواتير وإرسالها (للمراحل الجاية)
export async function getActiveCredentials(branchId) {
  const unit = await prisma.zatcaUnit.findUnique({ where: { branchId } });
  if (!unit || unit.status !== "active") return null;
  return {
    unitId: unit.id,
    environment: unit.environment,
    certificate: unit.productionCertificate,
    secret: decryptSecret(unit.productionSecretEnc),
    privateKey: decryptSecret(unit.privateKeyEnc),
  };
}

// الفرع مربوط بالزكاة ومعاه شهادة إنتاج؟ (الفواتير بتتوقّع وتتبعت)
export async function isZatcaActive(branchId) {
  if (!branchId) return false;
  const unit = await prisma.zatcaUnit.findUnique({
    where: { branchId },
    select: { status: true },
  });
  return unit?.status === "active";
}
