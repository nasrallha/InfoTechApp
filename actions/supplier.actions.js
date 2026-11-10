"use server";

// البوابة بين واجهة الموردين والسيرفر
// { refresh: true }: بعد النجاح تتحدث صفحة الموردين تلقائياً

import { runAction } from "@/lib/action";
import {
  createPartySchema,
  updatePartySchema,
  deletePartiesSchema,
} from "@/validations/party.schema";
import {
  createSupplier,
  updateSupplier,
  deleteSuppliers,
  getNextSupplierCode,
} from "@/services/supplier.service";

export async function createSupplierAction(input) {
  return runAction(
    createPartySchema,
    input,
    (data, user) => createSupplier(data, user),
    {
      permission: "suppliers.create",
      refresh: true,
    },
  );
}

export async function updateSupplierAction(input) {
  return runAction(
    updatePartySchema,
    input,
    (data, user) => updateSupplier(data, user),
    {
      permission: "suppliers.update",
      refresh: true,
    },
  );
}

export async function deleteSuppliersAction(ids) {
  return runAction(
    deletePartiesSchema,
    ids,
    (data, user) => deleteSuppliers(data, user),
    {
      permission: "suppliers.delete",
      refresh: true,
    },
  );
}

// الكود التالي للمورد الجديد (للعرض في الإضافة السريعة من فاتورة الشراء)
export async function getNextSupplierCodeAction() {
  return runAction(null, null, () => getNextSupplierCode(), {
    permission: "suppliers.create",
  });
}
