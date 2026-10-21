import { z } from "zod";
import { nameField, idField, idsField } from "./common.schema";

// بيانات إضافة وحدة
export const createUnitSchema = z.object({
  arName: nameField(),
  enName: nameField(),
  isActive: z.boolean().default(true),
});

// بيانات تعديل وحدة = بيانات الإضافة + رقم الوحدة
export const updateUnitSchema = createUnitSchema.extend({
  id: idField,
});

// حذف وحدة أو أكثر
export const deleteUnitsSchema = idsField;
