"use server";

// البوابة بين صفحة بيانات الشركة والسيرفر
// تستقبل FormData لأن فيها الشعار (صورة)

import { runAction } from "@/lib/action";
import { companySchema } from "@/validations/company.schema";
import { saveCompany } from "@/services/company.service";

// كل قيم FormData نصوص، فنجهزها قبل التحقق بـ Zod
function readCompanyForm(formData) {
  const text = (key) => formData.get(key) ?? "";
  const logo = formData.get("logo");

  return {
    arName: text("arName"),
    enName: text("enName"),
    taxNo: text("taxNo"),
    registrationNo: text("registrationNo"),
    sellerIdScheme: text("sellerIdScheme") || "CRN",
    sellerIdNumber: text("sellerIdNumber"),
    phone: text("phone"),
    email: text("email"),
    bankName: text("bankName"),
    bankAccountName: text("bankAccountName"),
    bankAccountNumber: text("bankAccountNumber"),
    iban: text("iban"),
    city: text("city"),
    district: text("district"),
    street: text("street"),
    buildingNo: text("buildingNo"),
    additionalNo: text("additionalNo"),
    postalCode: text("postalCode"),
    // ملف فاضي (بدون اختيار شعار) = لا يوجد شعار جديد
    logo: logo instanceof File && logo.size > 0 ? logo : null,
    removeLogo: formData.get("removeLogo") === "true",
  };
}

export async function saveCompanyAction(formData) {
  return runAction(
    companySchema,
    readCompanyForm(formData),
    (data) => saveCompany(data),
    {
      permission: "company.update",
      refresh: true,
    },
  );
}
