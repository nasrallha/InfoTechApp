"use server";

// البوابة بين شاشة المستودعات والسيرفر

import { runAction } from "@/lib/action";
import {
  createWarehouseSchema,
  updateWarehouseSchema,
  deleteWarehousesSchema,
} from "@/validations/warehouse.schema";
import {
  createWarehouse,
  updateWarehouse,
  deleteWarehouses,
} from "@/services/warehouse.service";

export async function createWarehouseAction(input) {
  return runAction(createWarehouseSchema, input, (d) => createWarehouse(d), {
    permission: "warehouses.create",
    refresh: true,
  });
}

export async function updateWarehouseAction(input) {
  return runAction(updateWarehouseSchema, input, (d) => updateWarehouse(d), {
    permission: "warehouses.update",
    refresh: true,
  });
}

export async function deleteWarehousesAction(ids) {
  return runAction(deleteWarehousesSchema, ids, (d) => deleteWarehouses(d), {
    permission: "warehouses.delete",
    refresh: true,
  });
}
