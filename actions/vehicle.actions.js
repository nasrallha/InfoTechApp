"use server";

// السيارات (وحدة vehicles - الورش)
import { runAction } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { idField } from "@/validations/common.schema";
import {
  createVehicleSchema,
  updateVehicleSchema,
  vehicleListSchema,
  vehicleSearchSchema,
} from "@/validations/vehicle.schema";
import {
  createVehicle,
  deleteVehicle,
  listVehicles,
  searchVehicles,
  updateVehicle,
  vehicleHistory,
  vehicleTypes,
} from "@/services/vehicle.service";

// البحث والإضافة السريعة من الفاتورة: لصاحب فاتورة البيع كمان
const canUse = (user, perm) =>
  can(user, perm) || (perm !== "vehicles.update" && can(user, "sales.create"));

export const listVehiclesAction = async (input) =>
  runAction(vehicleListSchema, input, (d) => listVehicles(d), {
    permission: "vehicles.view",
  });

export const searchVehiclesAction = async (q) =>
  runAction(vehicleSearchSchema, q, (d, user) => {
    if (!canUse(user, "vehicles.view")) throw new AppError("Forbidden");
    return searchVehicles(d);
  });

export const vehicleTypesAction = async () =>
  runAction(null, null, (_, user) => {
    if (!canUse(user, "vehicles.view")) throw new AppError("Forbidden");
    return vehicleTypes();
  });

export const createVehicleAction = async (input) =>
  runAction(createVehicleSchema, input, (d, user) => {
    if (!canUse(user, "vehicles.create")) throw new AppError("Forbidden");
    return createVehicle(d);
  });

export const updateVehicleAction = async (input) =>
  runAction(updateVehicleSchema, input, (d) => updateVehicle(d), {
    permission: "vehicles.update",
  });

export const deleteVehicleAction = async (id) =>
  runAction(idField, id, (d) => deleteVehicle(d), {
    permission: "vehicles.delete",
  });

export const vehicleHistoryAction = async (id) =>
  runAction(idField, id, (d, u) => vehicleHistory(d, u), {
    permission: "vehicles.view",
  });
