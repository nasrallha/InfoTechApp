import "server-only";
import { prisma } from "./prisma";
import { getSubscription } from "./subscription";

// ============================================================
// اسم مقدم الخدمة (فني / عاملة / حلاق / معالج)
// وضع الشركات: ثابت للنشاط من اللوحة (subscription.staffTitle)
// وإلا (أو نشاط من غير اسم): من الإعدادات العامة
// ============================================================
export async function getStaffTitle() {
  const sub = await getSubscription();
  if (sub?.staffTitle) return { title: sub.staffTitle, fixed: true };
  const s = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { staffTitle: true },
  });
  return { title: s?.staffTitle ?? "technician", fixed: false };
}
