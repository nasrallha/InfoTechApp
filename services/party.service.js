import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// منطق مشترك للعملاء والموردين (لهم نفس الحقول)
// modelName: "customer" أو "supplier" (اسم الموديل في Prisma)
// codes: مفاتيح رسائل الخطأ الخاصة بكل نوع
// extraSelect: حقول زيادة خاصة بالنوع (العملاء: الدولة والمعرّف)
export function createPartyService(modelName, codes, extraSelect = {}) {
  const model = prisma[modelName];

  // الرصيد Decimal في قاعدة البيانات ← رقم عادي للمتصفح
  const toDTO = (p) => ({ ...p, openingBalance: Number(p.openingBalance) });

  const select = {
    id: true,
    code: true,
    arName: true,
    enName: true,
    phone: true,
    taxNo: true,
    registrationNo: true,
    city: true,
    district: true,
    street: true,
    buildingNo: true,
    additionalNo: true,
    postalCode: true,
    openingBalance: true,
    isActive: true,
    ...extraSelect,
  };

  // الحقول الفريدة ورسالة الخطأ لكل واحد
  // (الكود لا نفحصه هنا لأن السيرفر هو الذي يولّده)
  const uniqueFields = {
    phone: "PhoneExists",
    taxNo: "TaxNoExists",
    registrationNo: "RegistrationNoExists",
  };

  // نتأكد قبل الحفظ أن الكود والجوال والرقم الضريبي والسجل غير مستخدمين
  // ونرجع الخطأ تحت الحقل نفسه في الفورم
  async function assertUnique(data, excludeId = null) {
    // العملاء: نفس المعرّف (النوع + الرقم) ما يتكررش
    if (extraSelect.idNumber && data.idScheme && data.idNumber) {
      const dup = await model.findFirst({
        where: {
          idScheme: data.idScheme,
          idNumber: data.idNumber,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      });
      if (dup) {
        throw new AppError("IdNumberExists", null, {
          idNumber: "IdNumberExists",
        });
      }
    }
    const conditions = Object.keys(uniqueFields)
      .filter((field) => data[field] !== null && data[field] !== undefined)
      .map((field) => ({ [field]: data[field] }));

    if (conditions.length === 0) return;

    const existing = await model.findFirst({
      where: {
        OR: conditions,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { phone: true, taxNo: true, registrationNo: true },
    });
    if (!existing) return;

    const fieldErrors = {};
    for (const [field, errorCode] of Object.entries(uniqueFields)) {
      if (data[field] != null && existing[field] === data[field]) {
        fieldErrors[field] = errorCode;
      }
    }
    const first = Object.values(fieldErrors)[0] ?? "DuplicateValue";
    throw new AppError(first, null, fieldErrors);
  }

  // الكود التالي = أكبر كود + 1
  async function nextCode() {
    const { _max } = await model.aggregate({ _max: { code: true } });
    return (_max.code ?? 0) + 1;
  }

  // لو حصل تكرار في نفس اللحظة (طلبان مع بعض) قاعدة البيانات ترفض بـ P2002
  function handleUniqueError(error) {
    if (error?.code === "P2002") throw new AppError("DuplicateValue");
    throw error;
  }

  return {
    async getAll() {
      const rows = await model.findMany({ orderBy: { code: "asc" }, select });
      return rows.map(toDTO);
    },

    // الكود التالي (لعرضه في فورم الإضافة)
    nextCode,

    async create(data) {
      await assertUnique(data);

      // الكود دائماً تلقائي = أكبر كود + 1
      // لو أضاف مستخدمان في نفس اللحظة وأخذا نفس الرقم، قاعدة البيانات ترفض الثاني
      // (@unique على code)، فنعيد المحاولة برقم جديد
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = await nextCode();
        try {
          return toDTO(await model.create({ data: { ...data, code }, select }));
        } catch (error) {
          const isCodeConflict =
            error?.code === "P2002" &&
            String(error?.meta?.target ?? "").includes("code");
          if (!isCodeConflict) handleUniqueError(error);
        }
      }
      throw new AppError("DuplicateValue");
    },

    async update({ id, ...data }) {
      const current = await model.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!current) throw new AppError(codes.notFound);

      await assertUnique(data, id);

      try {
        // الكود لا يتغير أبداً في التعديل (غير موجود في data أصلاً)
        return toDTO(await model.update({ where: { id }, data, select }));
      } catch (error) {
        handleUniqueError(error);
      }
    },

    async remove(ids) {
      // لا نحذف عميلاً/مورداً عليه فواتير (قاعدة البيانات ترفض بـ P2003)
      try {
        const { count } = await model.deleteMany({
          where: { id: { in: ids } },
        });
        return { deleted: count };
      } catch (error) {
        if (error?.code === "P2003") throw new AppError("PartyHasInvoices");
        throw error;
      }
    },
  };
}
