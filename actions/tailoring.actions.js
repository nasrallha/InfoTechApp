"use server";

// الخياط: الإعدادات (tailoring.manage) + الأشخاص والمقاسات (tailoring.measurements)
// + طلبات التفصيل (tailorOrders.*)

import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { z } from "zod";
import { idField, optionalText } from "@/validations/common.schema";
import {
  assignSchema,
  cancelSchema,
  customerSearchSchema,
  deliverSchema,
  paySchema,
  fieldSchema,
  measurementSchema,
  orderSchema,
  orderUpdateSchema,
  ordersListSchema,
  personSchema,
  phoneField,
  statusSchema,
  styleChoiceSchema,
  styleGroupSchema,
  tailorSettingsSchema,
} from "@/validations/tailoring.schema";
import {
  addMeasurement,
  deleteField,
  deleteMeasurement,
  deletePerson,
  deleteStyleChoice,
  deleteStyleGroup,
  findTailorCustomerByPhone,
  getTailorCustomer,
  resolveTailorCustomer,
  saveField,
  savePerson,
  saveStyleChoice,
  saveStyleGroup,
  saveTailorSettings,
  searchTailorCustomers,
} from "@/services/tailoring.service";
import {
  assignTailorOrder,
  cancelTailorOrder,
  createTailorOrder,
  deleteTailorOrder,
  updateTailorOrder,
  deliverTailorOrder,
  payTailorOrder,
  getTailorOrder,
  listTailorOrders,
  previewTailorOrder,
  setTailorOrderStatus,
} from "@/services/tailor-order.service";

const MANAGE = { permission: "tailoring.manage", refresh: true };
const MEASURE = { permission: "tailoring.measurements", refresh: true };

// ---------------- الإعدادات ----------------
export async function saveTailorSettingsAction(input) {
  return runAction(tailorSettingsSchema, input, (d) => saveTailorSettings(d), MANAGE);
}
export async function saveFieldAction(input) {
  return runAction(fieldSchema, input, (d) => saveField(d), MANAGE);
}
export async function deleteFieldAction(id) {
  return runAction(idField, id, (d) => deleteField(d), MANAGE);
}
export async function saveStyleGroupAction(input) {
  return runAction(styleGroupSchema, input, (d) => saveStyleGroup(d), MANAGE);
}
export async function deleteStyleGroupAction(id) {
  return runAction(idField, id, (d) => deleteStyleGroup(d), MANAGE);
}

// الاختيار بصورة ← FormData
function readChoiceForm(fd) {
  const id = fd.get("id");
  const image = fd.get("image");
  return {
    ...(id ? { id: Number(id) } : {}),
    groupId: Number(fd.get("groupId")),
    arName: fd.get("arName") ?? "",
    enName: fd.get("enName") ?? "",
    sortOrder: Number(fd.get("sortOrder") || 0),
    isActive: fd.get("isActive") === "true",
    image: image instanceof File && image.size > 0 ? image : null,
    removeImage: fd.get("removeImage") === "true",
    part: fd.get("part") || null,
    libraryImage: fd.get("libraryImage") || null,
  };
}
export async function saveStyleChoiceAction(formData) {
  return runAction(styleChoiceSchema, readChoiceForm(formData), (d) => saveStyleChoice(d), MANAGE);
}
export async function deleteStyleChoiceAction(id) {
  return runAction(idField, id, (d) => deleteStyleChoice(d), MANAGE);
}

// ---------------- العملاء والأشخاص والمقاسات ----------------
// البحث وفتح العميل: لأي حد يشوف الخياط (شاشة الطلب والعملاء)
export async function searchTailorCustomersAction(input) {
  return runAction(customerSearchSchema, input, (d) => searchTailorCustomers(d), {
    permission: "tailoring.view",
  });
}
export async function getTailorCustomerAction(id) {
  return runAction(idField, id, (d) => getTailorCustomer(d), { permission: "tailoring.view" });
}
export async function findTailorCustomerByPhoneAction(phone) {
  return runAction(phoneField, phone, (d) => findTailorCustomerByPhone(d), {
    permission: "tailoring.view",
  });
}
// عميل جديد من شاشة العملاء (الجوال + الاسم) - لو الجوال موجود بيرجع العميل نفسه
const newCustomerSchema = z.object({ phone: phoneField, customerName: optionalText(255) });
export async function createTailorCustomerAction(input) {
  return runAction(
    newCustomerSchema,
    input,
    async (d, user) => (await resolveTailorCustomer(d, user)).id,
    MEASURE,
  );
}
export async function savePersonAction(input) {
  return runAction(personSchema, input, (d) => savePerson(d), MEASURE);
}
export async function deletePersonAction(id) {
  return runAction(idField, id, (d) => deletePerson(d), MEASURE);
}
export async function addMeasurementAction(input) {
  return runAction(measurementSchema, input, (d, user) => addMeasurement(d, user), MEASURE);
}
export async function deleteMeasurementAction(id) {
  return runAction(idField, id, (d) => deleteMeasurement(d), MEASURE);
}

// ---------------- طلبات التفصيل ----------------
// تصدير الطلبات (Excel / PDF / طباعة): كل المطابق للبحث والفلاتر
export async function exportTailorOrdersAction(input) {
  return runAction(
    ordersListSchema,
    { ...input, all: true },
    async (d, user) => (await listTailorOrders(d, user)).rows,
    { permission: "tailorOrders.view" },
  );
}

// الطلب كامل (طباعة الكارت بعد الحفظ)
export async function getTailorOrderAction(id) {
  return runAction(idField, id, async (d, user) => {
    const o = await getTailorOrder(d, user);
    if (!o) throw new AppError("TailorOrderNotFound");
    return o;
  }, { permission: "tailorOrders.view" });
}
export async function previewTailorOrderAction(input) {
  return runAction(orderSchema, input, (d, user) => previewTailorOrder(d, user), {
    permission: "tailorOrders.create",
  });
}
export async function createTailorOrderAction(input) {
  return runAction(
    orderSchema,
    input,
    (d, user) => {
      // العربون على الفاتورة: طريقة دفع لازم
      if (d.payment?.amount > 0 && !d.payment.paymentMethodId)
        throw new AppError("PaymentMethodNotFound", null, { paymentMethodId: "PaymentMethodNotFound" });
      return createTailorOrder(d, user);
    },
    { permission: "tailorOrders.create", refresh: true },
  );
}
// تعديل الطلب كامل (نفس الرقم والفاتورة) - tailorOrders.update
export async function updateTailorOrderAction(input) {
  return runAction(
    orderUpdateSchema,
    input,
    (d, user) => {
      if (d.payment?.amount > 0 && !d.payment.paymentMethodId)
        throw new AppError("PaymentMethodNotFound", null, { paymentMethodId: "PaymentMethodNotFound" });
      return updateTailorOrder(d, user);
    },
    { permission: "tailorOrders.update", refresh: true },
  );
}
// حذف الطلب نهائياً بفاتورته - tailorOrders.delete
export async function deleteTailorOrderAction(id) {
  return runAction(idField, id, (d, user) => deleteTailorOrder(d, user), {
    permission: "tailorOrders.delete",
    refresh: true,
  });
}
export async function setTailorOrderStatusAction(input) {
  return runAction(statusSchema, input, (d, user) => setTailorOrderStatus(d, user), {
    permission: "tailorOrders.update",
    refresh: true,
  });
}
export async function assignTailorOrderAction(input) {
  return runAction(assignSchema, input, (d, user) => assignTailorOrder(d, user), {
    permission: "tailorOrders.update",
    refresh: true,
  });
}
// التحصيل من شاشة الخياط (سند قبض بيتعمل لوحده) - صلاحية tailorOrders.collect
// من غير صلاحية شاشة السندات: الكاشير يتعامل من قايمة الخياط بس
export async function payTailorOrderAction(input) {
  return runAction(paySchema, input, (d, user) => payTailorOrder(d, user), {
    permission: "tailorOrders.collect",
    refresh: true,
  });
}
export async function deliverTailorOrderAction(input) {
  return runAction(
    deliverSchema,
    input,
    (d, user) => {
      if (d.amount > 0 && !can(user, "tailorOrders.collect")) throw new AppError("Forbidden");
      return deliverTailorOrder(d, user);
    },
    { permission: "tailorOrders.deliver", refresh: true },
  );
}
export async function cancelTailorOrderAction(input) {
  return runAction(cancelSchema, input, (d, user) => cancelTailorOrder(d, user), {
    permission: "tailorOrders.cancel",
    refresh: true,
  });
}
