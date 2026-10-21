import "server-only";
import { AppError } from "@/lib/errors";

import { getGatewayKey } from "@/lib/zatca-local";
import { ensureGateway, gatewayUrl } from "@/lib/zatca-gateway-launcher";

// ============================================================
// عميل خدمة ZATCA Gateway (.NET + SDK الهيئة) - من السيرفر فقط
// - المفتاح المشترك والتشغيل تلقائي (lib/zatca-local + lib/zatca-gateway-launcher)
// - لو الخدمة واقفة: بنشغّلها ونعيد المحاولة مرة واحدة
// environment: "developer" | "simulation" | "production"
// ============================================================

async function send(path, body, method, timeout) {
  return fetch(gatewayUrl() + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Gateway-Key": getGatewayKey(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });
}

async function call(path, body, { method = "POST", timeout = 60000 } = {}) {
  let res;
  try {
    res = await send(path, body, method, timeout);
  } catch (error) {
    // انتهى وقت الطلب والخدمة شغالة: منعيدش (ممكن تكون اتنفذت عند الهيئة)
    if (error?.name === "TimeoutError")
      throw new AppError("ZatcaGatewayTimeout");
    // الخدمة واقفة: نشغّلها ونحاول تاني
    const p = await ensureGateway({ wait: true });
    if (p?.online && !p.authorized)
      throw new AppError("ZatcaGatewayKeyMismatch");
    if (!p?.online) throw new AppError("ZatcaGatewayUnavailable");
    try {
      res = await send(path, body, method, timeout);
    } catch {
      throw new AppError("ZatcaGatewayUnavailable");
    }
  }

  const data = await res.json().catch(() => null);
  if (res.status === 401) throw new AppError("ZatcaGatewayKeyMismatch");
  if (!res.ok) {
    // خطأ متوقع من الخدمة (بيانات ناقصة، شهادة غير صالحة، ...)
    throw new AppError("ZatcaGatewayError", {
      code: data?.error ?? String(res.status),
      message: data?.message ?? null,
      details: data?.details ?? null,
    });
  }
  return data;
}

export const zatcaGateway = {
  // حالة الخدمة
  health: () => call("/health", undefined, { method: "GET", timeout: 5000 }),
  // اختبار ذاتي بدون إنترنت (بناء + توقيع + تحقق)
  selfTest: () => call("/selftest", {}, { timeout: 120000 }),

  // --- التسجيل ---
  // { environment, commonName, organizationIdentifier, organizationUnitName, organizationName,
  //   invoiceType, locationAddress, industryBusinessCategory } → { csr, privateKey, serialNumber }
  generateCsr: (data) => call("/csr", data),
  // { environment, csr, otp } → { ok, requestId, binarySecurityToken, secret, certificate, errors }
  complianceCsid: (data) => call("/onboarding/compliance-csid", data),
  // { environment, invoice, credentials: { certificate, secret, privateKey } }
  complianceCheck: (data) => call("/onboarding/compliance-check", data),
  // { environment, complianceRequestId, credentials: { certificate, secret } }
  productionCsid: (data) => call("/onboarding/production-csid", data),
  // { environment, csr, otp, credentials: { certificate, secret } }
  renewCsid: (data) => call("/onboarding/renew", data),
  certificateInfo: (certificate) => call("/certificates/info", { certificate }),

  // --- الفواتير ---
  buildInvoice: (invoice) => call("/invoices/build", { invoice }),
  // → { xml (Base64), hash, qr, uuid, totals }
  signInvoice: (invoice, credentials, validate = false) =>
    call("/invoices/sign", { invoice, credentials, validate }),
  validateInvoice: (xml, certificate, pih) =>
    call("/invoices/validate", { xml, certificate, pih }),
  // mode: "reporting" | "clearance"
  // → { accepted, status, httpStatus, retryable, warnings, errors, hash, uuid, clearedXml, qr }
  submitInvoice: ({ environment, mode, xml, credentials, language }) =>
    call("/invoices/submit", { environment, mode, xml, credentials, language }),
};
