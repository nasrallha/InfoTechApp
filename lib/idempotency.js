import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// ============================================================
// بصمة الحفظ (Idempotency)
// كل شاشة حفظ بتبعت requestId (UUID) ثابت لنفس المحاولة.
// لو الرد ضاع (النت قطع / الصفحة علّقت) والمستخدم داس حفظ أو دفع تاني:
//   نفس البصمة ← بنرجّع المستند اللي اتحفظ أول مرة بدل ما نعمل واحد جديد
// - الفحص قبل الحفظ (الحالة العادية)
// - ولو طلبين بنفس البصمة وصلوا في نفس اللحظة: العمود unique في القاعدة
//   فالتاني بيفشل (P2002) ونرجّع له المستند اللي اتحفظ
// ============================================================

// model: "sale" | "purchase" | "voucher"
// select: الحقول اللي الشاشة مستنياها من الرد (نفس اللي بيرجع عند الحفظ العادي)
// run: الحفظ الفعلي (لازم يكتب requestId في المستند)
export async function saveOnce(model, requestId, user, select, run) {
  if (!requestId) return run();

  const find = () =>
    prisma[model].findUnique({
      where: { requestId },
      select: { ...select, createdById: true },
    });
  const replay = (doc) => {
    // بصمة مستخدم تاني (مستحيل عملياً مع UUID): منرجّعش مستند مش بتاعه
    if (doc.createdById !== user.id) throw new AppError("ValidationError");
    const result = { ...doc, replayed: true };
    if (!select.createdById) delete result.createdById;
    return result;
  };

  const previous = await find();
  if (previous) return replay(previous);

  try {
    return await run();
  } catch (error) {
    // سباق: طلب تاني بنفس البصمة سبقنا وحفظ (العمود unique فالحفظ هنا فشل)
    // (بنفحص بعد أي خطأ، لأن بعض الشاشات بتحوّل خطأ التكرار لرسالة تانية)
    const doc = await find().catch(() => null);
    if (doc) return replay(doc);
    throw error;
  }
}
