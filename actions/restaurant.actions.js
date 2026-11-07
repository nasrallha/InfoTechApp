"use server";

// المطعم (وحدة restaurant): المنيو (الأحجام والإضافات وأسعار التطبيقات) والسائقين والإعدادات
import { z } from "zod";
import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { idField } from "@/validations/common.schema";
import {
  addRestaurantItemsSchema,
  createRestaurantDriverSchema,
  createRestaurantGroupSchema,
  createRestaurantModifierSchema,
  createRestaurantSizeSchema,
  saveMenuItemSchema,
  saveRestaurantSettingsSchema,
  updateRestaurantDriverSchema,
  updateRestaurantGroupSchema,
  updateRestaurantModifierSchema,
  updateRestaurantSizeSchema,
} from "@/validations/restaurant.schema";
import {
  addRestaurantItems,
  createRestaurantDriver,
  createRestaurantGroup,
  createRestaurantModifier,
  createRestaurantSize,
  deleteRestaurantDriver,
  deleteRestaurantGroup,
  deleteRestaurantModifier,
  deleteRestaurantSize,
  removeRestaurantItem,
  saveMenuItem,
  saveRestaurantSettings,
  searchMenuCandidates,
  updateRestaurantDriver,
  updateRestaurantGroup,
  updateRestaurantModifier,
  updateRestaurantSize,
} from "@/services/restaurant.service";

const manage = { permission: "restaurant.manage", refresh: true };

// ---------- الأحجام ----------
export const createRestaurantSizeAction = async (input) =>
  runAction(createRestaurantSizeSchema, input, (d) => createRestaurantSize(d), manage);
export const updateRestaurantSizeAction = async (input) =>
  runAction(updateRestaurantSizeSchema, input, (d) => updateRestaurantSize(d), manage);
export const deleteRestaurantSizeAction = async (id) =>
  runAction(idField, id, (d) => deleteRestaurantSize(d), manage);

// ---------- مجموعات الإضافات ----------
export const createRestaurantGroupAction = async (input) =>
  runAction(createRestaurantGroupSchema, input, (d) => createRestaurantGroup(d), manage);
export const updateRestaurantGroupAction = async (input) =>
  runAction(updateRestaurantGroupSchema, input, (d) => updateRestaurantGroup(d), manage);
export const deleteRestaurantGroupAction = async (id) =>
  runAction(idField, id, (d) => deleteRestaurantGroup(d), manage);

// ---------- الإضافات ----------
export const createRestaurantModifierAction = async (input) =>
  runAction(
    createRestaurantModifierSchema,
    input,
    (d) => createRestaurantModifier(d),
    manage,
  );
export const updateRestaurantModifierAction = async (input) =>
  runAction(
    updateRestaurantModifierSchema,
    input,
    (d) => updateRestaurantModifier(d),
    manage,
  );
export const deleteRestaurantModifierAction = async (id) =>
  runAction(idField, id, (d) => deleteRestaurantModifier(d), manage);

// ---------- أصناف المنيو ----------
export const searchMenuCandidatesAction = async (q) =>
  runAction(z.string().trim().max(100), q, (d) => searchMenuCandidates(d), {
    permission: "restaurant.manage",
  });
export const addRestaurantItemsAction = async (ids) =>
  runAction(addRestaurantItemsSchema, ids, (d) => addRestaurantItems(d), manage);
export const removeRestaurantItemAction = async (productId) =>
  runAction(idField, productId, (d) => removeRestaurantItem(d), manage);
// FormData: image (الصورة) + payload (باقي البيانات JSON)
// الصنف الجديد كمان محتاج صلاحية إضافة الأصناف
export const saveMenuItemAction = async (formData) => {
  let payload = null;
  try {
    payload = JSON.parse(formData.get("payload") || "null");
  } catch {
    payload = null; // سيرفضها Zod
  }
  const image = formData.get("image");
  const input = {
    ...(payload ?? {}),
    image: image instanceof File && image.size > 0 ? image : null,
  };
  return runAction(
    saveMenuItemSchema,
    input,
    (d, u) => {
      if (!d.productId && !can(u, "products.create"))
        throw new AppError("Forbidden");
      return saveMenuItem(d, u);
    },
    manage,
  );
};

// ---------- السائقين ----------
export const createRestaurantDriverAction = async (input) =>
  runAction(createRestaurantDriverSchema, input, (d) => createRestaurantDriver(d), manage);
export const updateRestaurantDriverAction = async (input) =>
  runAction(updateRestaurantDriverSchema, input, (d) => updateRestaurantDriver(d), manage);
export const deleteRestaurantDriverAction = async (id) =>
  runAction(idField, id, (d) => deleteRestaurantDriver(d), manage);

// ---------- الإعدادات ----------
export const saveRestaurantSettingsAction = async (input) =>
  runAction(
    saveRestaurantSettingsSchema,
    input,
    (d) => saveRestaurantSettings(d),
    manage,
  );
