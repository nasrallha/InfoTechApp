"use server";

// البوابة بين واجهة الوحدات والسيرفر
// (الوحدات لا تحتوي ملفات، فنستقبل كائناً عادياً وليس FormData)
// { refresh: true }: بعد النجاح تتحدث صفحة الوحدات تلقائياً

import { runAction } from "@/lib/action";
import {
  createUnitSchema,
  updateUnitSchema,
  deleteUnitsSchema,
} from "@/validations/unit.schema";
import { createUnit, updateUnit, deleteUnits } from "@/services/unit.service";

export async function createUnitAction(input) {
  return runAction(createUnitSchema, input, (data) => createUnit(data), {
    permission: "units.create",
    refresh: true,
  });
}

export async function updateUnitAction(input) {
  return runAction(updateUnitSchema, input, (data) => updateUnit(data), {
    permission: "units.update",
    refresh: true,
  });
}

export async function deleteUnitsAction(ids) {
  return runAction(deleteUnitsSchema, ids, (data) => deleteUnits(data), {
    permission: "units.delete",
    refresh: true,
  });
}
