import { z } from "zod";
import { idField, optionalText } from "./common.schema";

// ============================================================
// السيارات (وحدة vehicles - الورش)
// ============================================================
const vehicleFields = {
  plateNo: z
    .string({ error: "RequiredField" })
    .trim()
    .min(1, "RequiredField")
    .max(30, "TextTooLong"),
  vehicleType: optionalText(100),
  // العميل اختياري (الزبون العابر)
  customerId: idField.nullish(),
  phone: optionalText(30),
  notes: optionalText(500),
};

export const createVehicleSchema = z.object(vehicleFields);
export const updateVehicleSchema = z.object({ ...vehicleFields, id: idField });

export const vehicleSearchSchema = z.string().trim().max(50);

export const vehicleListSchema = z.object({
  q: z.string().trim().max(100).default(""),
  // due = الغيار جه أو قرب (بالتاريخ)
  filter: z.enum(["all", "due"]).default("all"),
});
