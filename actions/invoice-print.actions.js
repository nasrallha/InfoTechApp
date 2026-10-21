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
