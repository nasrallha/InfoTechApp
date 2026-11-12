import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { BRANCH_CODE_RE, parseDocRef } from "@/lib/doc-number";

// ============================================================
// أرقام المستندات
// - الرقم الحقيقي يُحجز لحظة الحفظ جوه transaction بعملية واحدة في القاعدة
//   (INSERT ... ON DUPLICATE KEY UPDATE) بتقفل صف المسلسل لحد آخر الحفظ:
//   لو أكتر من مستخدم / جهاز بيحفظوا في نفس اللحظة كل واحد ياخد رقم مختلف،
//   وفوقها قيد فريد في الجدول (الفرع + النوع + الرقم) كحماية أخيرة
// - كل المستندات: مسلسل لكل فرع
//   (المفتاح "النوع@الفرع") ورمز الفرع قبل الرقم (DM-SI-5)، وبيكمل بعد أكبر رقم في الفرع
// - وكمان التحويلات والتوالف والجرد والورديات والحجوزات والصيانة والعقود واشتراكات المغسلة
// - peek: الرقم المتوقع للعرض في شاشة "جديد" (بيتحدث أول بأول)
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
  transfer: "transfer",
  count: "count",
  shift: "shift",
  booking: "booking",
  laundryWallet: "LW",
  rentContract: "rent_contract",
  // الإشعارات (كل نوع بمسلسل مستقل)
  saleCredit: "sale_credit",
  saleDebit: "sale_debit",
  purchaseCredit: "purchase_credit",
  purchaseDebit: "purchase_debit",
};

// الأنواع المترقّمة لكل فرع: الجدول + النوع جواه (عشان أكبر رقم موجود في الفرع)
export const BRANCH_DOCS = {
  purchase: { model: "purchase", type: "purchase" },
  purchaseReturn: { model: "purchase", type: "return" },
  purchaseCredit: { model: "purchase", type: "credit" },
  purchaseDebit: { model: "purchase", type: "debit" },
  sale: { model: "sale", type: "sale" },
  saleReturn: { model: "sale", type: "return" },
  saleCredit: { model: "sale", type: "credit" },
  saleDebit: { model: "sale", type: "debit" },
  quotation: { model: "quotation", type: null },
  receipt: { model: "voucher", type: "receipt" },
  payment: { model: "voucher", type: "payment" },
  settlement: { model: "voucher", type: "settlement" },
  offset: { model: "voucher", type: "offset" },
  // المرحلة التانية: كل مستند ترقيمه لكل فرع
  transfer: { model: "stockTransfer", type: null },
  adjustment: { model: "stockAdjustment", type: null },
  count: { model: "inventoryCount", type: null },
  shift: { model: "shift", type: null },
  booking: { model: "booking", type: null },
  claim: { model: "warrantyClaim", type: null },
  contract: { model: "maintenanceContract", type: null },
  laundryWallet: { model: "laundryWallet", type: null },
  rentContract: { model: "rentContract", type: null },
};

const branchKey = (kind, branchId) => `${SEQUENCE_KEYS[kind]}@${branchId}`;

// ------------------------------------------------------------
// رمز الفرع
// ------------------------------------------------------------

// رمز مقترح من الاسم الإنجليزي (Dammam ← DAM)، ولو متكرر: حرفين + رقم، وإلا B<رقم الفرع>
export async function suggestBranchCode(db, { id, enName }, excludeId = null) {
  const taken = new Set(
    (
      await db.branch.findMany({
        where: {
          code: { not: null },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { code: true },
      })
    ).map((b) => b.code),
  );
  // الكلمة "Branch / Main" مش بتدخل في الرمز
  const words = String(enName ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["BRANCH", "THE"].includes(w));
  const letters = (words[0] ?? "").replace(/^[0-9]+/, "");
  const candidates = [];
  if (letters.length >= 2) candidates.push(letters.slice(0, 3));
  if (words.length > 1)
    candidates.push(words.map((w) => w[0]).join("").replace(/^[0-9]+/, "").slice(0, 3));
  for (const c of candidates) if (BRANCH_CODE_RE.test(c) && !taken.has(c)) return c;
  const base = (letters.slice(0, 2) || "B").padEnd(1, "B");
  for (let i = 2; i < 100; i++) {
    const c = `${base}${i}`;
    if (BRANCH_CODE_RE.test(c) && !taken.has(c)) return c;
  }
  return `B${id}`;
}

// رمز الفرع وقت الترقيم: بيتعمل لو فاضي، وبيتقفل (مبقاش يتغير) - جوه الـ transaction
async function lockBranchCode(tx, branchId) {
  const b = await tx.branch.findUnique({
    where: { id: branchId },
    select: { id: true, enName: true, code: true, codeLocked: true },
  });
  if (!b) throw new AppError("BranchNotFound");
  if (b.code && b.codeLocked) return b.code;
  const code = b.code ?? (await suggestBranchCode(tx, b, b.id));
  // COALESCE: لو مستخدم تاني لحق وحط رمز في نفس اللحظة، رمزه هو اللي يفضل
  await tx.$executeRaw`UPDATE branches SET code = COALESCE(code, ${code}), codeLocked = true WHERE id = ${branchId}`;
  const after = await tx.branch.findUnique({
    where: { id: branchId },
    select: { code: true },
  });
  return after.code;
}

// ------------------------------------------------------------
// حجز الرقم التالي لمستند في فرع (جوه نفس الـ transaction اللي بيحفظ المستند)
// kind: مفتاح من BRANCH_DOCS ← { number, docCode }
// ------------------------------------------------------------
export async function nextBranchNumber(tx, kind, branchId) {
  const doc = BRANCH_DOCS[kind];
  if (!doc) throw new Error(`Unknown branch document kind: ${kind}`);
  const docCode = await lockBranchCode(tx, branchId);
  // البداية: بعد أكبر رقم موجود للنوع ده في الفرع (المستندات القديمة)
  const agg = await tx[doc.model].aggregate({
    where: { branchId, ...(doc.type ? { type: doc.type } : {}) },
    _max: { number: true },
  });
  const start = (agg._max.number ?? 0) + 1;
  const key = branchKey(kind, branchId);
  // عملية واحدة: أول مرة ← start، وبعدها ← +1 (والصف بيتقفل لحد نهاية الحفظ)
  await tx.$executeRaw`INSERT INTO document_sequences (\`key\`, \`last\`) VALUES (${key}, ${start}) ON DUPLICATE KEY UPDATE \`last\` = GREATEST(\`last\` + 1, ${start})`;
  const seq = await tx.documentSequence.findUnique({
    where: { key },
    select: { last: true },
  });
  return { number: seq.last, docCode };
}

// ------------------------------------------------------------
// الرقم المتوقع (للعرض فقط)
// - الأنواع المترقّمة لكل فرع ← { number, code } (code: رمز الفرع، أو المقترح لو لسه فاضي)
// - الباقي ← { number, code: null }
// ------------------------------------------------------------
export async function peekNextDoc(type, branchId) {
  const doc = BRANCH_DOCS[type];
  if (!doc || !branchId) {
    const seq = await prisma.documentSequence.findUnique({
      where: { key: SEQUENCE_KEYS[type] },
      select: { last: true },
    });
    return { number: (seq?.last ?? 0) + 1, code: null };
  }
  const [seq, agg, branch] = await Promise.all([
    prisma.documentSequence.findUnique({
      where: { key: branchKey(type, branchId) },
      select: { last: true },
    }),
    prisma[doc.model].aggregate({
      where: { branchId, ...(doc.type ? { type: doc.type } : {}) },
      _max: { number: true },
    }),
    prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, enName: true, code: true },
    }),
  ]);
  const number = Math.max((seq?.last ?? 0) + 1, (agg._max.number ?? 0) + 1);
  const code =
    branch?.code ?? (branch ? await suggestBranchCode(prisma, branch, branch.id) : null);
  return { number, code };
}

// الرقم بس (للاستخدامات القديمة اللي محتاجة رقم)
export async function peekNextNumber(type, branchId = null) {
  return (await peekNextDoc(type, branchId)).number;
}

// ------------------------------------------------------------
// البحث برقم مستند ← شرط { number, branchId } (أو null لو مش رقم)
// - "DM-SI-5" ← فرع الرمز ده
// - "5" أو "SI-5" ← الفرع المختار في الفلتر، وإلا فرع المستخدم الحالي
//   (الرقم بقى بيتكرر بين الفروع، فمن غير رمز بيدوّر في فرعك)
// ------------------------------------------------------------
export async function docNumberWhere(value, user, branchId = null) {
  const ref = parseDocRef(value);
  if (!ref) return null;
  if (ref.code) {
    const b = await prisma.branch.findUnique({
      where: { code: ref.code },
      select: { id: true },
    });
    // رمز مش موجود ← مفيش نتيجة (فرع رقم 0)
    return { number: ref.number, branchId: b?.id ?? 0 };
  }
  return { number: ref.number, branchId: branchId ?? user.branch.id };
}
