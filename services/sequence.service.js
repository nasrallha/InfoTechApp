import "server-only";
import { prisma } from "@/lib/prisma";

// ============================================================
// الرقم التالي لكل نوع مستند (للعرض فقط في شاشة "جديد")
// - الرقم الحقيقي يُحجز لحظة الحفظ داخل transaction يقفل صف المسلسل،
//   فلو أكتر من مستخدم بيحفظوا في نفس اللحظة كل واحد ياخد رقم مختلف
//   (مفيش تكرار ولا تداخل)، والشاشة تعرض الرقم المتوقع وتتحدث أول بأول
// ============================================================
export const SEQUENCE_KEYS = {
  purchase: "purchase",
  purchaseReturn: "purchase_return",
  sale: "sale",
  saleReturn: "sale_return",
  quotation: "quotation",
  receipt: "receipt",
  payment: "payment",
  settlement: "settlement",
  offset: "offset",
  claim: "warranty_claim",
  contract: "maintenance_contract",
  adjustment: "adjustment",
  // الإشعارات (كل نوع بمسلسل مستقل)
  saleCredit: "sale_credit",
  saleDebit: "sale_debit",
  purchaseCredit: "purchase_credit",
  purchaseDebit: "purchase_debit",
};

export async function peekNextNumber(type) {
  const key = SEQUENCE_KEYS[type];
  const seq = await prisma.documentSequence.findUnique({
    where: { key },
    select: { last: true },
  });
  return (seq?.last ?? 0) + 1;
}
