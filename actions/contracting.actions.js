"use server";

// المقاولات (وحدة contracting): النماذج (contracting.manage) والعقود (constructionContracts.*)
// وأوامر التغيير والدفعة المقدمة والمستخلصات والتحصيل

import { z } from "zod";
import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { idField } from "@/validations/common.schema";
import {
  advanceSchema,
  certificateSchema,
  quickCertificateSchema,
  updateCertificateSchema,
  changeOrderSchema,
  contractSchema,
  paymentSchema,
  statusSchema,
  templateSchema,
} from "@/validations/contracting.schema";
import {
  createChangeOrder,
  deleteChangeOrder,
  deleteContract,
  deleteTemplate,
  saveContract,
  saveTemplate,
  setContractStatus,
} from "@/services/contracting.service";
import {
  addPayment,
  advancePreview,
  cancelAdvance,
  cancelCertificate,
  createCertificate,
  createQuickCertificate,
  listCertificates,
  updateCertificate,
  deleteCertificate,
  deletePayment,
  getCertificate,
  issueAdvance,
  updateAdvance,
} from "@/services/contract-certificate.service";

// ---------------- نماذج صيغة العقد ----------------
export async function saveTemplateAction(input) {
  return runAction(templateSchema, input, (d) => saveTemplate(d), {
    permission: "contracting.manage",
    refresh: true,
  });
}

export async function deleteTemplateAction(id) {
  return runAction(idField, id, (d) => deleteTemplate(d), {
    permission: "contracting.manage",
    refresh: true,
  });
}

// ---------------- العقد ----------------
export async function saveContractAction(input) {
  return runAction(
    contractSchema,
    input,
    (d, user) => {
      if (!can(user, d.id ? "constructionContracts.update" : "constructionContracts.create"))
        throw new AppError("Forbidden");
      return saveContract(d, user);
    },
    { refresh: true },
  );
}

export async function setContractStatusAction(input) {
  return runAction(statusSchema, input, (d, user) => setContractStatus(d, user), {
    permission: "constructionContracts.update",
    refresh: true,
  });
}

export async function deleteContractAction(id) {
  return runAction(idField, id, (d, user) => deleteContract(d, user), {
    permission: "constructionContracts.delete",
  });
}

// ---------------- أوامر التغيير ----------------
export async function createChangeOrderAction(input) {
  return runAction(changeOrderSchema, input, (d, user) => createChangeOrder(d, user), {
    permission: "constructionContracts.changeOrders",
    refresh: true,
  });
}

export async function deleteChangeOrderAction(id) {
  return runAction(idField, id, (d, user) => deleteChangeOrder(d, user), {
    permission: "constructionContracts.changeOrders",
    refresh: true,
  });
}

// ---------------- الدفعة المقدمة ----------------
// amount: قيمة تانية (نافذة التعديل) بدل قيمة الدفعة المقدمة في العقد
export async function advancePreviewAction(input) {
  return runAction(
    z.object({ id: idField, amount: z.number().positive("MustBePositive").nullish() }),
    input,
    (d, user) => {
      if (!can(user, "constructionContracts.invoice") && !can(user, "constructionContracts.editInvoice"))
        throw new AppError("Forbidden");
      return advancePreview(d.id, user, d.amount ?? null);
    },
  );
}

export async function issueAdvanceAction(input) {
  return runAction(advanceSchema, input, (d, user) => issueAdvance(d, user), {
    permission: "constructionContracts.invoice",
    refresh: true,
  });
}

// تعديل فاتورة الدفعة المقدمة بنفس رقمها (القيمة + السداد)
export async function updateAdvanceAction(input) {
  return runAction(advanceSchema, input, (d, user) => updateAdvance(d, user), {
    permission: "constructionContracts.editInvoice",
    refresh: true,
  });
}

export async function cancelAdvanceAction(contractId) {
  return runAction(idField, contractId, (d, user) => cancelAdvance(d, user), {
    permission: "constructionContracts.cancelInvoice",
    refresh: true,
  });
}

// ---------------- المستخلصات ----------------
export async function createCertificateAction(input) {
  return runAction(certificateSchema, input, (d, user) => createCertificate(d, user), {
    permission: "constructionContracts.invoice",
  });
}

// تعديل المستخلص وفاتورته بنفس رقمها (القيم + السداد)
export async function updateCertificateAction(input) {
  return runAction(updateCertificateSchema, input, (d, user) => updateCertificate(d, user), {
    permission: "constructionContracts.editInvoice",
    refresh: true,
  });
}

// إلغاء المستخلص بمرتجع (الفاتورة كلها)
export async function cancelCertificateAction(id) {
  return runAction(idField, id, (d, user) => cancelCertificate(d, user), {
    permission: "constructionContracts.cancelInvoice",
    refresh: true,
  });
}

// تقرير المستخلصات: كل الصفوف بنفس الفلتر (للتصدير PDF / Excel)
export async function exportCertificatesAction(input) {
  return runAction(
    z.object({
      q: z.string().trim().max(100).default(""),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      kind: z.enum(["all", "owner", "sub", "quick"]).default("all"),
    }),
    input,
    (d, user) => listCertificates({ ...d, all: true }, user),
    { permission: "constructionContracts.view" },
  );
}

// المستخلص السريع (من غير عقد)
export async function createQuickCertificateAction(input) {
  return runAction(quickCertificateSchema, input, (d, user) => createQuickCertificate(d, user), {
    permission: "constructionContracts.invoice",
  });
}

export async function deleteCertificateAction(id) {
  return runAction(idField, id, (d, user) => deleteCertificate(d, user), {
    permission: "constructionContracts.cancelInvoice",
    refresh: true,
  });
}

// المستخلص للطباعة
export async function getCertificateAction(id) {
  return runAction(idField, id, (d, user) => getCertificate(d, user), {
    permission: "constructionContracts.view",
  });
}

// ---------------- التحصيل / السداد ----------------
export async function addPaymentAction(input) {
  return runAction(paymentSchema, input, (d, user) => addPayment(d, user), {
    permission: "constructionContracts.payments",
    refresh: true,
  });
}

export async function deletePaymentAction(id) {
  return runAction(idField, id, (d, user) => deletePayment(d, user), {
    permission: "constructionContracts.payments",
    refresh: true,
  });
}
