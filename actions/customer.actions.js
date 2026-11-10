"use server";

// البوابة بين واجهة العملاء والسيرفر
// { refresh: true }: بعد النجاح تتحدث صفحة العملاء تلقائياً

import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerB2BSchema,
  customerB2BIssues,
  deletePartiesSchema,
} from "@/validations/party.schema";
import { isZatcaActive } from "@/services/zatca.service";

// العميل الشركة: العنوان الوطني وباقي بيانات الفاتورة الضريبية إجبارية
// بس لو فرع المستخدم مربوط بالزكاة (غير كده: الرقم الضريبي والسجل كفاية)
// (العميل لو اتباع له بعدين من فرع مربوط: شاشة البيع بتطلب تكميل بياناته)
async function assertB2BComplete(data, user) {
  const issues = customerB2BIssues(data);
  const first = Object.values(issues)[0];
  if (first && (await isZatcaActive(user?.branch?.id)))
    throw new AppError(first, null, issues);
}
import {
  createCustomer,
  updateCustomer,
  deleteCustomers,
  completeCustomerB2B,
  getNextCustomerCode,
} from "@/services/customer.service";

export async function createCustomerAction(input) {
  return runAction(
    createCustomerSchema,
    input,
    async (data, user) => {
      await assertB2BComplete(data, user);
      return createCustomer(data, user);
    },
    {
      permission: "customers.create",
      refresh: true,
    },
  );
}

export async function updateCustomerAction(input) {
  return runAction(
    updateCustomerSchema,
    input,
    async (data, user) => {
      await assertB2BComplete(data, user);
      return updateCustomer(data, user);
    },
    {
      permission: "customers.update",
      refresh: true,
    },
  );
}

export async function deleteCustomersAction(ids) {
  return runAction(
    deletePartiesSchema,
    ids,
    (data, user) => deleteCustomers(data, user),
    {
      permission: "customers.delete",
      refresh: true,
    },
  );
}

// إكمال بيانات العميل الشركة (الرقم الضريبي والعنوان الوطني) من شاشة البيع
export async function completeCustomerB2BAction(input) {
  return runAction(
    customerB2BSchema,
    input,
    (data, user) => completeCustomerB2B(data, user),
    {
      permission: "customers.update",
      refresh: true,
    },
  );
}

// الكود التالي للعميل الجديد (للعرض في الإضافة السريعة من شاشات البيع)
export async function getNextCustomerCodeAction() {
  return runAction(null, null, () => getNextCustomerCode(), {
    permission: "customers.create",
  });
}

// فرع المستخدم مربوط بالزكاة؟ (فورم العميل: العنوان الوطني إجباري للشركات ولا لأ)
export async function companyZatcaActiveAction() {
  return runAction(null, null, (_, user) => isZatcaActive(user?.branch?.id));
}
