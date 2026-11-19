// ============================================================
// مستندات المستخدم: من غير صلاحية «عرض مستندات المستخدمين الآخرين»
// المستخدم بيشوف اللي عمله بنفسه بس (والمندوب: اللي باسمه كمان)
// المبيعات والمرتجعات وعروض الأسعار والإشعارات والمشتريات ومرتجعاتها
// (مدير النظام والمالك: الكل دايماً)
// ============================================================
import { can } from "@/lib/permissions";

export const VIEW_ALL_DOCS = "documents.viewAll";

export const seesAllDocs = (user) => can(user, VIEW_ALL_DOCS);

// شرط Prisma يتضاف للـ where (فاضي = الكل)
// rep: المستند فيه salesRepId (البيع / عرض السعر)
export function ownDocs(user, { rep = false } = {}) {
  if (seesAllDocs(user)) return {};
  return {
    AND: [
      rep
        ? { OR: [{ createdById: user.id }, { salesRepId: user.id }] }
        : { createdById: user.id },
    ],
  };
}
