import "server-only";
import { createPartyService } from "./party.service";

// خدمة الموردين: نفس منطق الأطراف المشترك على موديل supplier
const service = createPartyService("supplier", { notFound: "SupplierNotFound" });

export const getSuppliers = service.getAll;
export const getNextSupplierCode = service.nextCode;
export const createSupplier = service.create;
export const updateSupplier = service.update;
export const deleteSuppliers = service.remove;
