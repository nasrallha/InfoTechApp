import { z } from "zod";
import { nameField, idField, idsField, optionalText } from "./common.schema";

const warehouseFields = {
  arName: nameField(100),
  enName: nameField(100),
  isMain: z.boolean().default(false),
  isActive: z.boolean().default(true),
  notes: optionalText(255),
};

export const createWarehouseSchema = z.object(warehouseFields);
export const updateWarehouseSchema = z.object({
  ...warehouseFields,
  id: idField,
});
export const deleteWarehousesSchema = idsField;
