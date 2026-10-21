"use server";

// البوابة بين شاشات المخزون (الأرصدة، التحويلات، الجرد) والسيرفر

import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { idField } from "@/validations/common.schema";
import {
  productSearchSchema,
  productBrowseSchema,
} from "@/validations/purchase.schema";
import {
  createTransferSchema,
  receiveTransferSchema,
  createCountSchema,
  updateCountSchema,
  countSheetSchema,
  stockBalancesSchema,
  itemCardSchema,
} from "@/validations/inventory.schema";
import {
  searchPurchaseProducts,
  browsePurchaseProducts,
} from "@/services/purchase.service";
import {
  getItemCard,
  getStockBalances,
  getVisibleWarehouses,
} from "@/services/stock.service";
import {
  createTransfer,
  receiveTransfer,
  cancelTransfer,
  getCountSheet,
  createCount,
  updateCount,
  postCount,
  deleteCount,
} from "@/services/inventory.service";

// المستودعات التي يطلبها المستخدم (واحد أو الكل) بشرط أن تكون مسموحة له
async function scopedWarehouseIds(user, warehouseId) {
  const visible = (await getVisibleWarehouses(user)).map((w) => w.id);
  if (!warehouseId) return visible;
  if (!visible.includes(warehouseId)) throw new AppError("Forbidden");
  return [warehouseId];
}

// ------------------------------------------------------------
// الأرصدة وكارت الصنف
// ------------------------------------------------------------
export async function getStockBalancesAction(input) {
  return runAction(
    stockBalancesSchema,
    input,
    async ({ warehouseId, ...filters }, user) =>
      getStockBalances({
        ...filters,
        warehouseIds: await scopedWarehouseIds(user, warehouseId),
      }),
    { permission: "stock.view" },
  );
}

export async function getItemCardAction(input) {
  return runAction(
    itemCardSchema,
    input,
    async ({ productId, warehouseId }, user) =>
      getItemCard({
        productId,
        warehouseIds: await scopedWarehouseIds(user, warehouseId),
      }),
    { permission: "stock.view" },
  );
}

// ------------------------------------------------------------
// اختيار الأصناف في التحويل والجرد (نفس بحث المشتريات)
// ------------------------------------------------------------
const assertPicker = (user) => {
  if (!can(user, "transfers.create") && !can(user, "inventoryCounts.create")) {
    throw new AppError("Forbidden");
  }
};

export async function searchStockProductsAction(query) {
  return runAction(productSearchSchema, query, (q, user) => {
    assertPicker(user);
    return searchPurchaseProducts(q);
  });
}

export async function browseStockProductsAction(input) {
  return runAction(productBrowseSchema, input, (d, user) => {
    assertPicker(user);
    return browsePurchaseProducts(d);
  });
}

// ------------------------------------------------------------
// التحويلات
// ------------------------------------------------------------
export async function createTransferAction(input) {
  return runAction(
    createTransferSchema,
    input,
    (d, user) => createTransfer(d, user),
    { permission: "transfers.create" },
  );
}

export async function receiveTransferAction(input) {
  return runAction(
    receiveTransferSchema,
    input,
    (d, user) => receiveTransfer(d, user),
    { permission: "transfers.receive", refresh: true },
  );
}

export async function cancelTransferAction(id) {
  return runAction(idField, id, (d, user) => cancelTransfer(d, user), {
    permission: "transfers.cancel",
    refresh: true,
  });
}

// ------------------------------------------------------------
// الجرد
// ------------------------------------------------------------
export async function getCountSheetAction(input) {
  return runAction(
    countSheetSchema,
    input,
    async (d, user) => {
      await scopedWarehouseIds(user, d.warehouseId);
      return getCountSheet(d);
    },
    { permission: "inventoryCounts.create" },
  );
}

export async function createCountAction(input) {
  return runAction(
    createCountSchema,
    input,
    (d, user) => createCount(d, user),
    { permission: "inventoryCounts.create" },
  );
}

export async function updateCountAction(input) {
  return runAction(
    updateCountSchema,
    input,
    (d, user) => updateCount(d, user),
    { permission: "inventoryCounts.create", refresh: true },
  );
}

export async function postCountAction(id) {
  return runAction(idField, id, (d, user) => postCount(d, user), {
    permission: "inventoryCounts.post",
    refresh: true,
  });
}

export async function deleteCountAction(id) {
  return runAction(idField, id, (d, user) => deleteCount(d, user), {
    permission: "inventoryCounts.delete",
  });
}
