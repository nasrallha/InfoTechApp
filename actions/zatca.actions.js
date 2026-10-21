"use server";

// البوابة بين شاشة الربط مع الزكاة والسيرفر (كل خطوة بصلاحية zatca.setup)

import { runAction } from "@/lib/action";
import { can } from "@/lib/permissions";
import {
  zatcaDocsFilterSchema,
  zatcaSaleSchema,
  zatcaSettingsSchema,
  zatcaBranchSchema,
  zatcaOtpSchema,
  zatcaUnitSchema,
} from "@/validations/zatca.schema";
import {
  generateZatcaCsr,
  renewProductionCsid,
  requestComplianceCsid,
  requestProductionCsid,
  resetZatcaUnit,
  runComplianceChecks,
  saveZatcaUnit,
  startZatcaGateway,
  testZatcaGateway,
} from "@/services/zatca.service";
import {
  getDocumentXml,
  getZatcaAlerts,
  listZatcaDocuments,
  saveZatcaSettings,
  sendAllPending,
  sendSaleNow,
} from "@/services/zatca-invoice.service";

const SETUP = { permission: "zatca.setup", refresh: true };

export async function saveZatcaUnitAction(input) {
  return runAction(
    zatcaUnitSchema,
    input,
    (d, user) => saveZatcaUnit(d, user),
    SETUP,
  );
}

export async function generateZatcaCsrAction(input) {
  return runAction(
    zatcaBranchSchema,
    input,
    (d, user) => generateZatcaCsr(d.branchId, user),
    SETUP,
  );
}

export async function requestComplianceCsidAction(input) {
  return runAction(
    zatcaOtpSchema,
    input,
    (d, user) => requestComplianceCsid(d.branchId, d.otp, user),
    SETUP,
  );
}

export async function runComplianceChecksAction(input) {
  return runAction(
    zatcaBranchSchema,
    input,
    (d, user) => runComplianceChecks(d.branchId, user),
    SETUP,
  );
}

export async function requestProductionCsidAction(input) {
  return runAction(
    zatcaBranchSchema,
    input,
    (d, user) => requestProductionCsid(d.branchId, user),
    SETUP,
  );
}

export async function renewProductionCsidAction(input) {
  return runAction(
    zatcaOtpSchema,
    input,
    (d, user) => renewProductionCsid(d.branchId, d.otp, user),
    SETUP,
  );
}

export async function resetZatcaUnitAction(input) {
  return runAction(
    zatcaBranchSchema,
    input,
    (d, user) => resetZatcaUnit(d.branchId, user),
    SETUP,
  );
}

export async function testZatcaGatewayAction() {
  return runAction(null, null, () => testZatcaGateway(), {
    permission: "zatca.setup",
  });
}

// تشغيل خدمة الربط يدوياً من الشاشة (لو وقفت)
export async function startZatcaGatewayAction() {
  return runAction(null, null, () => startZatcaGateway(), {
    permission: "zatca.setup",
    refresh: true,
  });
}

// ------------------------------------------------------------
// الفواتير الإلكترونية
// ------------------------------------------------------------
export async function saveZatcaSettingsAction(input) {
  return runAction(zatcaSettingsSchema, input, (d) => saveZatcaSettings(d), {
    permission: "zatca.setup",
    refresh: true,
  });
}

// متابعة الفواتير (وتقرير الفواتير المرفوعة)
export async function listZatcaDocumentsAction(input) {
  return runAction(
    zatcaDocsFilterSchema,
    input,
    (d, user) => listZatcaDocuments(d, user),
    { permission: "zatca.view" },
  );
}

// إرسال / إعادة إرسال فاتورة واحدة
export async function sendZatcaInvoiceAction(input) {
  return runAction(
    zatcaSaleSchema,
    input,
    (d, user) => sendSaleNow(d.saleId, user),
    { permission: "zatca.send", refresh: true },
  );
}

// إرسال كل المعلّق الآن
export async function sendAllPendingAction() {
  return runAction(null, null, () => sendAllPending(), {
    permission: "zatca.send",
  });
}

// الـ XML الرسمي (للتنزيل أو لإرفاقه في PDF/A-3)
export async function getZatcaXmlAction(input) {
  return runAction(
    zatcaSaleSchema,
    input,
    (d, user) => getDocumentXml(d.saleId, user),
    { permission: "zatca.export" },
  );
}

// الإشعارات (الجرس): لو مفيش صلاحية بيرجع null من غير خطأ
export async function getZatcaAlertsAction() {
  return runAction(null, null, (_, user) =>
    can(user, "zatca.view") ? getZatcaAlerts(user) : null,
  );
}
