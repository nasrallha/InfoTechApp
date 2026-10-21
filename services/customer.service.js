import "server-only";
import { createPartyService } from "./party.service";

// خدمة العملاء: نفس منطق الأطراف المشترك على موديل customer
const service = createPartyService(
  "customer",
  { notFound: "CustomerNotFound" },
  // الدولة ومعرّف العميل (للربط مع الزكاة والتصدير)
  { countryCode: true, idScheme: true, idNumber: true },
);

export const getCustomers = service.getAll;
export const getNextCustomerCode = service.nextCode;
export const createCustomer = service.create;
export const updateCustomer = service.update;
export const deleteCustomers = service.remove;

// إكمال بيانات العميل الشركة / التصدير (تعديل جزئي: المعرّف والدولة والعنوان فقط)
export const completeCustomerB2B = service.update;
