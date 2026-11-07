import "server-only";
import { prisma } from "./prisma";
import { AppError } from "./errors";
import { planLimit } from "./plan-features";

// ============================================================
// حدود الباقة (وضع الشركات): عدد المستخدمين والفروع والأصناف والفواتير
// - null = من غير حد (أو الشركة من غير باقة، أو وضع القاعدة الواحدة)
// - مالك البرنامج مش عليه حد
// ============================================================
const COUNTERS = {
  users: {
    limit: "maxUsers",
    error: "PlanLimitUsers",
    count: () => prisma.user.count({ where: { isOwner: false } }),
  },
  branches: {
    limit: "maxBranches",
    error: "PlanLimitBranches",
    count: () => prisma.branch.count(),
  },
  products: {
    limit: "maxProducts",
    error: "PlanLimitProducts",
    count: () => prisma.product.count(),
  },
  // عدد فواتير البيع كلها (حد ثابت للباقة، مش بيرجع صفر كل شهر)
  // (الاسم القديم maxInvoicesMonth فضل زي ما هو في القواعد)
  invoicesMonth: {
    limit: "maxInvoicesMonth",
    error: "PlanLimitInvoices",
    count: () => prisma.sale.count({ where: { type: "sale" } }),
  },
};

// adding: عدد اللي هيتضاف مرة واحدة (توليد المقاسات بيضيف كذا صنف)
export async function assertPlanLimit(kind, user, adding = 1) {
  if (user?.isOwner) return;
  const c = COUNTERS[kind];
  const max = await planLimit(c.limit);
  if (max == null) return;
  if ((await c.count()) + adding > max) throw new AppError(c.error, { max });
}
