import { z } from "zod";
import {
  nameField,
  idField,
  idsField,
  optionalDigits,
  optionalText,
  nationalAddressFields,
} from "./common.schema";
import {
  BUYER_ID_SCHEMES,
  COUNTRY_CODES,
  buyerMissing,
  idValid,
  isForeign,
} from "@/lib/zatca-tax";

// "الأطراف" = العملاء والموردون (لهم نفس الحقول بالضبط)
// فنكتب القواعد مرة واحدة ونستخدمها في الاثنين

const partyFields = {
  // ملاحظة: الكود (code) غير موجود هنا عن قصد
  // السيرفر هو الذي يعطيه تلقائياً (1، 2، 3 ...) ولا يقبله من المستخدم أبداً

  arName: nameField(255),
  enName: nameField(255),

  // اختيارية لكن لا تتكرر
  phone: optionalDigits(/^\d{9,11}$/, "PhoneInvalid"),
  taxNo: optionalDigits(/^\d{15}$/, "TaxNoInvalid"),
  registrationNo: optionalDigits(/^\d{10}$/, "RegistrationNoInvalid"),

  // العنوان الوطني (اختياري بالكامل: ليس كل العملاء لهم عنوان وطني)
  ...nationalAddressFields,

  // الرصيد الافتتاحي: يمكن أن يكون سالباً
  openingBalance: z.number({ error: "RequiredField" }).default(0),

  isActive: z.boolean().default(true),
};

export const createPartySchema = z.object(partyFields);

export const updatePartySchema = z.object({ ...partyFields, id: idField });

export const deletePartiesSchema = idsField;

// ------------------------------------------------------------
// العملاء: نفس حقول الأطراف + الدولة + معرّف العميل للربط مع الزكاة
// - العميل المحلي اللي له رقم ضريبي أو معرّف (سجل / رقم موحد / هوية ...) = شركة
//   (فاتورته ضريبية): لازم المعرّف صحيح والعنوان الوطني كامل
// - العميل الأجنبي (الدولة مش السعودية): من غير رقم ضريبي سعودي،
//   والعنوان بشكل حر (من غير شروط العنوان الوطني)
// ------------------------------------------------------------
// السجل التجاري للعميل بقى جوه المعرّف (النوع CRN) فمبقاش خانة لوحده
const { registrationNo: _cr, ...customerBase } = partyFields;

const customerFields = {
  ...customerBase,
  // العنوان بشكل حر هنا، وشروط العنوان الوطني بتتفحص للعميل المحلي بس (تحت)
  buildingNo: optionalText(10),
  additionalNo: optionalText(10),
  postalCode: optionalText(10),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => COUNTRY_CODES.includes(v), "ValidationError")
    .default("SA"),
  idScheme: z.preprocess(
    (v) => (v === "" ? null : v),
    z.enum(BUYER_ID_SCHEMES, "ValidationError").nullish(),
  ),
  idNumber: optionalText(30),
};

const SA_ADDRESS = {
  buildingNo: [/^\d{4}$/, "BuildingNoInvalid"],
  additionalNo: [/^\d{4}$/, "AdditionalNoInvalid"],
  postalCode: [/^\d{5}$/, "PostalCodeInvalid"],
};

function checkCustomer(c, ctx) {
  const issue = (path, message) =>
    ctx.addIssue({ code: "custom", path: [path], message });

  // المعرّف: النوع والرقم مع بعض، والرقم بالشكل الصحيح
  if (c.idNumber && !c.idScheme) issue("idScheme", "IdSchemeRequired");
  if (c.idScheme && !c.idNumber) issue("idNumber", "RequiredField");
  if (c.idScheme && c.idNumber && !idValid(c.idScheme, c.idNumber))
    issue("idNumber", "IdNumberInvalid");

  if (isForeign(c)) {
    // العميل الأجنبي مالوش رقم ضريبي سعودي
    if (c.taxNo) issue("taxNo", "TaxNoForeign");
    return;
  }

  // العميل المحلي: شكل العنوان الوطني
  for (const [field, [re, code]] of Object.entries(SA_ADDRESS)) {
    if (c[field] && !re.test(c[field])) issue(field, code);
  }
  // العميل الشركة: بيانات الفاتورة الضريبية كاملة
  for (const field of buyerMissing(c)) {
    if (field === "idNumber") continue; // اتفحص فوق
    issue(field, field === "taxNo" ? "TaxNoInvalidZatca" : "B2BFieldRequired");
  }
}

export const createCustomerSchema = z
  .object(customerFields)
  .superRefine(checkCustomer);

export const updateCustomerSchema = z
  .object({ ...customerFields, id: idField })
  .superRefine(checkCustomer);

// إكمال بيانات العميل الشركة / عميل التصدير من شاشة البيع
export const customerB2BSchema = z
  .object({
    id: idField,
    taxNo: optionalDigits(/^\d{15}$/, "TaxNoInvalid"),
    countryCode: customerFields.countryCode,
    idScheme: customerFields.idScheme,
    idNumber: customerFields.idNumber,
    city: customerFields.city,
    district: customerFields.district,
    street: customerFields.street,
    buildingNo: customerFields.buildingNo,
    additionalNo: customerFields.additionalNo,
    postalCode: customerFields.postalCode,
  })
  .superRefine(checkCustomer);
