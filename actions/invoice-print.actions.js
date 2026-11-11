"use server";

// حفظ إعدادات طباعة الفواتير (صلاحية "printing.update")

import { runAction } from "@/lib/action";
import { invoicePrintSchema } from "@/validations/invoice-print.schema";
import {
  getInvoicePrintSettings,
  saveInvoicePrintSettings,
} from "@/services/invoice-print.service";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/services/company.service";
import { peekNextNumber } from "@/services/sequence.service";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { getSale } from "@/services/sale.service";
import { getQuotation } from "@/services/quotation.service";
import { getPurchase } from "@/services/purchase.service";
import { getNote } from "@/services/note.service";

export async function saveInvoicePrintAction(input) {
  return runAction(
    invoicePrintSchema,
    input,
    (data) => saveInvoicePrintSettings(data),
    {
      permission: "printing.update",
      refresh: true,
    },
  );
}

// ------------------------------------------------------------
// بيانات معاينة الفاتورة قبل الحفظ (أي مستخدم داخل البرنامج)
// إعدادات الطباعة + بيانات الشركة + فرع المستخدم + اسمه + الرقم المتوقع
// type: sale | saleReturn | quotation | purchase | purchaseReturn
// ------------------------------------------------------------

const previewTypeSchema = z.enum([
  "sale",
  "saleReturn",
  "quotation",
  "purchase",
  "purchaseReturn",
]);

export async function getPreviewContextAction(type) {
  return runAction(previewTypeSchema, type, async (t, user) => {
    const [settings, company, branch, number] = await Promise.all([
      getInvoicePrintSettings(),
      getCompany(),
      prisma.branch.findUnique({
        where: { id: user.branch.id },
        select: {
          id: true,
          arName: true,
          enName: true,
          phone: true,
          registrationNo: true,
          city: true,
          district: true,
          street: true,
          buildingNo: true,
          additionalNo: true,
          postalCode: true,
        },
      }),
      peekNextNumber(t),
    ]);
    return {
      settings,
      company,
      branch,
      number,
      user: { arFullname: user.arFullname, enFullname: user.enFullname },
    };
  });
}

// ------------------------------------------------------------
// المستند بعد الحفظ (للطباعة في نفس شاشة الإضافة من غير ما ننتقل)
// kind: sale | return | quotation | purchase | purchaseReturn
//       | saleNote | purchaseNote
// بيرجّع المستند + بيانات الشركة + إعدادات الطباعة
// ------------------------------------------------------------
const SAVED_VIEW_PERM = {
  sale: "sales.view",
  return: "salesReturns.view",
  quotation: "quotations.view",
  purchase: "purchases.view",
  purchaseReturn: "purchaseReturns.view",
  saleNote: "salesNotes.view",
  purchaseNote: "purchaseNotes.view",
};

const savedDocSchema = z.object({
  kind: z.enum(Object.keys(SAVED_VIEW_PERM)),
  id: z.number().int().positive(),
});

export async function getSavedDocForPrintAction(input) {
  return runAction(savedDocSchema, input, async ({ kind, id }, user) => {
    // الصلاحية: عرض نوع المستند، أو إضافته (اللي لسه حافظه)
    const createPerm = SAVED_VIEW_PERM[kind].replace(".view", ".create");
    if (!can(user, SAVED_VIEW_PERM[kind]) && !can(user, createPerm))
      throw new AppError("Forbidden");
    const load = {
      sale: () => getSale(id, "sale", user),
      return: () => getSale(id, "return", user),
      quotation: () => getQuotation(id, user),
      purchase: () => getPurchase(id, "purchase", user),
      purchaseReturn: () => getPurchase(id, "return", user),
      saleNote: () => getNote("sale", id, user),
      purchaseNote: () => getNote("purchase", id, user),
    }[kind];
    const [doc, company, settings] = await Promise.all([
      load(),
      getCompany(),
      getInvoicePrintSettings(),
    ]);
    if (!doc) throw new AppError("SaleNotFound");
    return { doc, company, settings };
  });
}
