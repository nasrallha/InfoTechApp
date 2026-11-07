"use server";

// طاولات المطعم: الإضافة والتعديل والحذف (شاشة المطعم ← الطاولات)
import { runAction } from "@/lib/action";
import { idField } from "@/validations/common.schema";
import { saveTableSchema } from "@/validations/restaurant.schema";
import { deleteTable, saveTable } from "@/services/restaurant-table.service";

const manage = { permission: "restaurant.manage", refresh: true };

export const saveTableAction = async (input) =>
  runAction(saveTableSchema, input, (d) => saveTable(d), manage);

export const deleteTableAction = async (id) =>
  runAction(idField, id, (d) => deleteTable(d), manage);
