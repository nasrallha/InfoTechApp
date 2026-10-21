import "server-only";
import { can } from "@/lib/permissions";

// صلاحيات شاشات البيع التي تحتاجها الواجهة
export const salePerms = (user) => ({
  changePrice: can(user, "sales.changePrice"),
  discount: can(user, "sales.discount"),
  credit: can(user, "sales.credit"),
  changeDate: can(user, "sales.changeDate"),
});

// صلاحيات شاشة عرض السعر: تغيير السعر والخصم بصلاحية العرض أو صلاحية البيع
export const quotationPerms = (user) => ({
  ...salePerms(user),
  changePrice:
    can(user, "quotations.changePrice") || can(user, "sales.changePrice"),
  discount: can(user, "quotations.discount") || can(user, "sales.discount"),
});
