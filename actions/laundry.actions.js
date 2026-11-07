"use server";

// المغسلة (وحدة laundry): الخدمات والإضافات وأسعار القطع
import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { idField } from "@/validations/common.schema";
import {
  createLaundryAddonGroupSchema,
  createLaundryAddonSchema,
  createLaundryServiceSchema,
  saveLaundryItemSchema,
  saveLaundryPricesSchema,
  updateLaundryAddonGroupSchema,
  updateLaundryAddonSchema,
  updateLaundryServiceSchema,
} from "@/validations/laundry.schema";
import {
  createLaundryAddon,
  createLaundryAddonGroup,
  createLaundryService,
  deleteLaundryAddon,
  deleteLaundryAddonGroup,
  deleteLaundryService,
  getActiveLaundryServices,
  getLaundryItem,
  saveLaundryItem,
  saveLaundryPrices,
  updateLaundryAddon,
  updateLaundryAddonGroup,
  updateLaundryService,
} from "@/services/laundry.service";

const manage = { permission: "laundry.manage", refresh: true };

// فورم الصنف: صاحب صلاحية إضافة/تعديل الأصناف بيحدد أسعار القطعة كمان
const canEditItem = (user) =>
  can(user, "laundry.manage") ||
  can(user, "products.create") ||
  can(user, "products.update");

// ---------- الخدمات ----------
export const createLaundryServiceAction = async (input) =>
  runAction(createLaundryServiceSchema, input, (d) => createLaundryService(d), manage);

export const updateLaundryServiceAction = async (input) =>
  runAction(updateLaundryServiceSchema, input, (d) => updateLaundryService(d), manage);

export const deleteLaundryServiceAction = async (id) =>
  runAction(idField, id, (d) => deleteLaundryService(d), manage);

// ---------- مجموعات الإضافات ----------
export const createLaundryAddonGroupAction = async (input) =>
  runAction(
    createLaundryAddonGroupSchema,
    input,
    (d) => createLaundryAddonGroup(d),
    manage,
  );

export const updateLaundryAddonGroupAction = async (input) =>
  runAction(
    updateLaundryAddonGroupSchema,
    input,
    (d) => updateLaundryAddonGroup(d),
    manage,
  );

export const deleteLaundryAddonGroupAction = async (id) =>
  runAction(idField, id, (d) => deleteLaundryAddonGroup(d), manage);

// ---------- الإضافات ----------
export const createLaundryAddonAction = async (input) =>
  runAction(createLaundryAddonSchema, input, (d) => createLaundryAddon(d), manage);

export const updateLaundryAddonAction = async (input) =>
  runAction(updateLaundryAddonSchema, input, (d) => updateLaundryAddon(d), manage);

export const deleteLaundryAddonAction = async (id) =>
  runAction(idField, id, (d) => deleteLaundryAddon(d), manage);

// ---------- أسعار القطع ----------
// جدول الأسعار (تعديل جماعي)
export const saveLaundryPricesAction = async (rows) =>
  runAction(saveLaundryPricesSchema, rows, (d) => saveLaundryPrices(d), manage);

// فورم الصنف: الخدمات المتاحة (صنف جديد)
export const activeLaundryServicesAction = async () =>
  runAction(null, null, (_, user) => {
    if (!canEditItem(user)) throw new AppError("Forbidden");
    return getActiveLaundryServices();
  });

// فورم الصنف: الصنف قطعة مغسلة؟ وأسعاره (تعديل)
export const getLaundryItemAction = async (productId) =>
  runAction(idField, productId, (d, user) => {
    if (!canEditItem(user)) throw new AppError("Forbidden");
    return getLaundryItem(d);
  });

// فورم الصنف (بعد حفظ الصنف): صنف مغسلة ولا لأ + أسعاره
export const saveLaundryItemAction = async (input) =>
  runAction(saveLaundryItemSchema, input, (d, user) => {
    if (!canEditItem(user)) throw new AppError("Forbidden");
    return saveLaundryItem(d);
  });
