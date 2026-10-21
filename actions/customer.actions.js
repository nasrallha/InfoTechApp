"use server";

// البوابة بين واجهة العملاء والسيرفر
// { refresh: true }: بعد النجاح تتحدث صفحة العملاء تلقائياً

import { runAction } from "@/lib/action";
import {
  createCustomerSchema,
  updateCustomerSchema,
  customerB2BSchema,
  deletePartiesSchema,
} from "@/validations/party.schema";
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
    (data) => createCustomer(data),
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
    (data) => updateCustomer(data),
    {
      permission: "customers.update",
      refresh: true,
    },
  );
}

export async function deleteCustomersAction(ids) {
  return runAction(deletePartiesSchema, ids, (data) => deleteCustomers(data), {
    permission: "customers.delete",
    refresh: true,
  });
}

// إكمال بيانات العميل الشركة (الرقم الضريبي والعنوان الوطني) من شاشة البيع
export async function completeCustomerB2BAction(input) {
  return runAction(
    customerB2BSchema,
    input,
    (data) => completeCustomerB2B(data),
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
