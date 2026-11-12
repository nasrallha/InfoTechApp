import "server-only";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { assertModule } from "@/lib/modules";
import { dbDateToDay, formatDay } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import { productTax } from "@/lib/zatca-tax";
import { calcInvoice } from "@/lib/invoice-calc";
import { createSaleSchema, updateSaleSchema } from "@/validations/sale.schema";
import { findOrCreate } from "./product.service";
import { createSale, deleteSale, updateSale } from "./sale.service";
import { afterSaleSaved } from "./zatca-invoice.service";
import { getSystemSettings } from "./system-settings.service";
import { getBaseCurrency } from "./currency.service";

// ============================================================
// فاتورة دفعة الإيجار (من شاشة العقد لما ميعاد الدفعة ييجي)
// - فاتورة بيع عادية (آجل على المستأجر) ← الزكاة وكشف الحساب والقبض بسند زي أي فاتورة
// - سطر لكل وحدة في العقد: نصيبها من الدفعة + الفترة (من - إلى) + رقم العقد
// - الأصناف: «إيجار سكني» (معفى - التوريدات العقارية VATEX-SA-30)
//   و«إيجار تجاري» (بنسبة ضريبة الشركة) - خدمات بتتعمل لوحدها أول مرة
// - الدفعة بتتحجز الأول (مفيش فاتورتين لنفس الدفعة لو اتضغط مرتين / من جهازين)
// - الفاتورة على فرع العقد (مدير النظام من أي فرع)
// - السعر من العقد مش من المستخدم ← صلاحية «إصدار فاتورة الدفعة» هي اللي بتحكم
//   (مش «تغيير السعر» ولا «البيع الآجل»)
// - السداد على الفاتورة نفسها (مش بسند):
//   payment = { paymentMethodId, reference, paidAmount, remainder }
//   - من غير طريقة دفع ← الفاتورة كلها آجل على المستأجر
//   - paidAmount فاضي أو = الإجمالي ← مدفوعة بالكامل
//   - سداد جزئي (paidAmount أقل من إجمالي الفاتورة شامل الضريبة):
//     remainder = "credit" ← الفاتورة بالدفعة كاملة، والمدفوع دلوقتي، والباقي آجل (يتسدد بسند بعدين)
//     remainder = "carry"  ← الفاتورة بالمدفوع بس (مدفوعة كلها)، والباقي (قبل الضريبة)
//                            يترحل على الدفعة اللي بعدها في نفس العقد
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));

// صنف الإيجار (خدمة) حسب الاستخدام - بيتعمل أول مرة
const RENT_PRODUCTS = {
  residential: { code: "RENT-RES", arName: "إيجار سكني", enName: "Residential rent" },
  commercial: { code: "RENT-COM", arName: "إيجار تجاري", enName: "Commercial rent" },
};

async function rentProduct(useType) {
  const def = RENT_PRODUCTS[useType] ?? RENT_PRODUCTS.commercial;
  const found = await prisma.product.findUnique({
    where: { code: def.code },
    select: { id: true, baseUnitId: true, taxRate: true },
  });
  if (found) return found;
  const [unitId, categoryId, settings] = await Promise.all([
    findOrCreate("unit", "خدمة", "Service"),
    findOrCreate("category", "خدمات", "Services"),
    getSystemSettings(),
  ]);
  // السكني معفى (التوريدات العقارية) والتجاري بنسبة ضريبة الشركة
  const taxRate = useType === "residential" ? 0 : Number(settings.taxRate ?? 15);
  const tax = productTax({
    taxRate,
    taxCategory: taxRate > 0 ? "S" : "E",
    taxExemptionCode: "VATEX-SA-30",
  });
  try {
    return await prisma.product.create({
      data: {
        ...def,
        categoryId,
        baseUnitId: unitId,
        isService: true,
        cost: 0,
        price: 0,
        taxRate,
        isPriceIncludeTax: false,
        ...tax,
      },
      select: { id: true, baseUnitId: true, taxRate: true },
    });
  } catch (error) {
    // اتعمل في نفس اللحظة من طلب تاني
    if (error?.code !== "P2002") throw error;
    return prisma.product.findUnique({
      where: { code: def.code },
      select: { id: true, baseUnitId: true, taxRate: true },
    });
  }
}

// بيانات الدفعة اللي الفاتورة محتاجاها (الإصدار والتعديل)
const INSTALLMENT_SELECT = {
  id: true,
  seq: true,
  periodFrom: true,
  periodTo: true,
  amount: true,
  status: true,
  saleId: true,
  carried: true,
  carriedToId: true,
  contractId: true,
  contract: {
    select: {
      id: true,
      number: true,
      docCode: true,
      branchId: true,
      customerId: true,
      units: {
        orderBy: { id: "asc" },
        select: {
          annualRent: true,
          unit: {
            select: {
              unitNo: true,
              kind: true,
              useType: true,
              property: { select: { name: true } },
            },
          },
        },
      },
    },
  },
};

async function loadInstallment(installmentId, user) {
  const inst = await prisma.rentInstallment.findUnique({
    where: { id: installmentId },
    select: INSTALLMENT_SELECT,
  });
  if (!inst || (!can(user, "allBranches.view") && inst.contract.branchId !== user.branch.id))
    throw new AppError("RentInstallmentNotFound");
  return inst;
}

// فرع العقد + السعر من العقد والآجل على المستأجر (بصلاحية الفوترة)
const actingUser = (user, branchId, extra = []) => ({
  ...user,
  branch: { ...user.branch, id: branchId },
  permissions: [
    ...(user.permissions ?? []),
    "sales.create",
    "sales.changePrice",
    "sales.credit",
    ...extra,
  ],
});

// ------------------------------------------------------------
// سطور الفاتورة والسداد والترحيل (الإصدار والتعديل)
// amount: مبلغ الدفعة قبل الضريبة (من غير أي ترحيل منها)
// carryTo: الدفعة اللي يترحل لها الباقي (التعديل: نفس اللي اترحل لها قبل كده)
// ------------------------------------------------------------
async function buildRentInvoice(inst, amount, payment, carryTo = null) {
  const c = inst.contract;
  const [t, currency] = await Promise.all([
    getTranslations("RealEstate"),
    getBaseCurrency(),
  ]);
  const decimals = currency?.decimals ?? 2;
  const round = (v) => Math.round((v + Number.EPSILON) * 10 ** decimals) / 10 ** decimals;
  const docNo = formatDocNo("rentContract", c.number, c.docCode);
  const from = formatDay(dbDateToDay(inst.periodFrom));
  const to = formatDay(dbDateToDay(inst.periodTo));

  // سطور الفاتورة لمبلغ (قبل الضريبة): نصيب كل وحدة بنسبة إيجارها
  // (آخر وحدة بتاخد فرق التقريب) + إجمالي الفاتورة بنفس حساب فاتورة البيع بالظبط
  const annual = c.units.reduce((s, u) => s + n(u.annualRent), 0);
  const products = [];
  for (const u of c.units) products.push(await rentProduct(u.unit.useType));
  const buildLines = (value) => {
    let left = value;
    const items = c.units.map((u, i) => {
      const share =
        i === c.units.length - 1
          ? round(left)
          : round(annual > 0 ? (value * n(u.annualRent)) / annual : value / c.units.length);
      left -= share;
      return {
        productId: products[i].id,
        unitId: products[i].baseUnitId,
        qty: 1,
        price: share,
        note: t("InvoiceLine", {
          unit: `${t(`kind_${u.unit.kind}`)} ${u.unit.unitNo}`,
          property: u.unit.property.name,
          from,
          to,
          contract: docNo,
        }).slice(0, 500),
      };
    });
    const { totals } = calcInvoice({
      items: items.map((it, i) => ({ qty: it.qty, price: it.price, taxRate: n(products[i].taxRate) })),
      taxMode: "exclusive",
      decimals,
    });
    return { items, total: totals.total };
  };

  let { items, total } = buildLines(amount);
  const paid = payment?.paidAmount;
  const partial =
    payment?.paymentMethodId && paid != null && paid > 0 && paid < total - 1e-9;
  let payAmount = total;
  let carry = 0;
  let next = null;
  if (partial && payment.remainder === "carry") {
    // الفاتورة بنسبة المدفوع، والباقي (قبل الضريبة) يترحل للدفعة الجاية
    next =
      carryTo ??
      (await prisma.rentInstallment.findFirst({
        where: { contractId: inst.contractId, seq: { gt: inst.seq }, status: "due", saleId: null },
        orderBy: { seq: "asc" },
        select: { id: true },
      }));
    if (!next) throw new AppError("RentNoNextInstallment");
    const invoiced = round(amount * (paid / total));
    ({ items, total } = buildLines(invoiced));
    carry = round(amount - invoiced);
    payAmount = total;
  } else if (partial) {
    // الفاتورة بالدفعة كاملة، والمدفوع دلوقتي بس (الباقي آجل)
    payAmount = round(paid);
  }
  const data = {
    source: "invoice",
    customerId: c.customerId,
    // من غير ملاحظات (فترة السداد والعقد في عمود «فترة السداد» وبيانات العميل)
    items,
    payments: payment?.paymentMethodId
      ? [
          {
            paymentMethodId: payment.paymentMethodId,
            amount: payAmount,
            reference: payment.reference ?? null,
          },
        ]
      : [],
  };
  return { data, carry, next, round };
}

export async function issueInstallmentInvoice(installmentId, user, payment = null) {
  await assertModule("realEstate");
  const inst = await loadInstallment(installmentId, user);
  if (inst.status !== "due" || inst.saleId) throw new AppError("RentInstallmentInvoiced");

  // حجز الدفعة (اللي بعده يلاقيها اتفوترت)
  const claimed = await prisma.rentInstallment.updateMany({
    where: { id: inst.id, status: "due", saleId: null },
    data: { status: "invoiced" },
  });
  if (!claimed.count) throw new AppError("RentInstallmentInvoiced");

  try {
    const amount = n(inst.amount);
    const { data, carry, next, round } = await buildRentInvoice(inst, amount, payment);
    const created = await createSale(
      createSaleSchema.parse(data),
      actingUser(user, inst.contract.branchId),
    );
    // الترحيل: الدفعة دي بالمفوتر، والباقي على الدفعة الجاية
    await prisma.$transaction([
      prisma.rentInstallment.update({
        where: { id: inst.id },
        data: {
          saleId: created.id,
          // الترحيل: المبلغ اللي اترحل والدفعة اللي اترحل ليها (للإلغاء والتعديل)
          ...(carry > 0
            ? { amount: round(amount - carry), carried: carry, carriedToId: next.id }
            : { carried: 0, carriedToId: null }),
        },
      }),
      ...(carry > 0
        ? [
            prisma.rentInstallment.update({
              where: { id: next.id },
              data: { amount: { increment: carry } },
            }),
          ]
        : []),
    ]);
    // الزكاة (لو الفرع مربوط): نفس اللي بيحصل بعد حفظ أي فاتورة بيع
    const zatca = await afterSaleSaved(created.id, {}).catch(() => null);
    return { saleId: created.id, zatca };
  } catch (error) {
    // الفاتورة متعملتش ← الدفعة ترجع مستحقة
    await prisma.rentInstallment
      .updateMany({ where: { id: inst.id, saleId: null }, data: { status: "due" } })
      .catch(() => {});
    throw error;
  }
}

// ------------------------------------------------------------
// تعديل فاتورة الدفعة (القيمة + السداد) - صلاحية rentContracts.editInvoice
// - نفس رقم الفاتورة (تعديل فاتورة البيع بنفس قيودها): الموقّعة للزكاة مقفولة
//   (التصحيح بإشعار دائن)، وكمان لو عليها سندات قبض أو مرتجع
// - amount: قيمة الدفعة كلها قبل الضريبة (قبل أي ترحيل منها)
// - payment: زي الإصدار (كامل / جزئي آجل أو مترحّل / آجل)
// - الترحيل القديم بيرجع والجديد بيتسجل، وقيمة العقد بتتعدل بفرق القيمة
// ------------------------------------------------------------
export async function updateInstallmentInvoice(installmentId, user, amount, payment = null) {
  await assertModule("realEstate");
  const inst = await loadInstallment(installmentId, user);
  if (!inst.saleId) throw new AppError("RentInstallmentNotInvoiced");
  const oldCarry = n(inst.carried);
  const oldNextId = oldCarry > 0 ? inst.carriedToId : null;
  if (oldNextId) {
    const next = await prisma.rentInstallment.findUnique({
      where: { id: oldNextId },
      select: { status: true, saleId: true },
    });
    if (next && (next.status !== "due" || next.saleId))
      throw new AppError("RentCarryInvoiced");
  }
  const { data, carry, next, round } = await buildRentInvoice(
    inst,
    amount,
    payment,
    oldNextId ? { id: oldNextId } : null,
  );
  await updateSale(
    updateSaleSchema.parse({ ...data, id: inst.saleId }),
    actingUser(user, inst.contract.branchId, ["sales.update"]),
  );
  // فرق قيمة العقد: الدفعة دي (قبل ترحيلها) ← القيمة الجديدة
  const diff = round(amount - (n(inst.amount) + oldCarry));
  await prisma.$transaction([
    prisma.rentInstallment.update({
      where: { id: inst.id },
      data: {
        amount: round(amount - carry),
        carried: carry,
        carriedToId: carry > 0 ? next.id : null,
      },
    }),
    ...(oldNextId
      ? [
          prisma.rentInstallment.update({
            where: { id: oldNextId },
            data: { amount: { decrement: oldCarry } },
          }),
        ]
      : []),
    ...(carry > 0
      ? [
          prisma.rentInstallment.update({
            where: { id: next.id },
            data: { amount: { increment: carry } },
          }),
        ]
      : []),
    ...(diff
      ? [
          prisma.rentContract.update({
            where: { id: inst.contractId },
            data: { totalAmount: { increment: diff } },
          }),
        ]
      : []),
  ]);
  const zatca = await afterSaleSaved(inst.saleId, {}).catch(() => null);
  return { saleId: inst.saleId, zatca };
}

// ------------------------------------------------------------
// معاينة فاتورة الدفعة (لنافذة الإصدار): الإجمالي شامل الضريبة بنفس حساب الفاتورة
// + هل فيه دفعة جاية (عشان ترحيل الباقي)
// ------------------------------------------------------------
// amount: قيمة تانية (نافذة التعديل) بدل قيمة الدفعة
export async function previewInstallment(installmentId, user, amountOverride = null) {
  await assertModule("realEstate");
  const inst = await prisma.rentInstallment.findUnique({
    where: { id: installmentId },
    select: {
      id: true,
      seq: true,
      amount: true,
      carried: true,
      carriedToId: true,
      contractId: true,
      contract: {
        select: {
          branchId: true,
          units: { orderBy: { id: "asc" }, select: { annualRent: true, unit: { select: { useType: true } } } },
        },
      },
    },
  });
  if (!inst || (!can(user, "allBranches.view") && inst.contract.branchId !== user.branch.id))
    throw new AppError("RentInstallmentNotFound");
  const decimals = (await getBaseCurrency())?.decimals ?? 2;
  const round = (v) => Math.round((v + Number.EPSILON) * 10 ** decimals) / 10 ** decimals;
  const units = inst.contract.units;
  const annual = units.reduce((s, u) => s + n(u.annualRent), 0);
  // التعديل: القيمة كلها قبل الترحيل القديم منها
  const amount = amountOverride ?? n(inst.amount) + n(inst.carried);
  let left = amount;
  const lines = [];
  for (let i = 0; i < units.length; i++) {
    const share =
      i === units.length - 1
        ? round(left)
        : round(annual > 0 ? (amount * n(units[i].annualRent)) / annual : amount / units.length);
    left -= share;
    const p = await rentProduct(units[i].unit.useType);
    lines.push({ qty: 1, price: share, taxRate: n(p.taxRate) });
  }
  const { totals } = calcInvoice({ items: lines, taxMode: "exclusive", decimals });
  // الدفعة اللي اترحل لها قبل كده لسه متاحة للترحيل
  const next =
    n(inst.carried) > 0 && inst.carriedToId
      ? 1
      : await prisma.rentInstallment.count({
          where: { contractId: inst.contractId, seq: { gt: inst.seq }, status: "due", saleId: null },
        });
  return { amount, tax: totals.tax, total: totals.total, hasNext: next > 0 };
}

// ------------------------------------------------------------
// إلغاء فاتورة الدفعة (للتصحيح ثم إصدارها تاني) - صلاحية rentContracts.cancelInvoice
// - نفس حذف فاتورة البيع وقيوده: بعد بدء الإرسال الفعلي للزكاة ممنوع،
//   وكمان لو عليها مرتجع / سندات (التصحيح ساعتها بإشعار دائن)
// - الدفعة بترجع مستحقة، ولو كان فيه ترحيل: المبلغ بيرجع من الدفعة الجاية
//   (لو الجاية اتفوترت خلاص: لازم تتلغي فاتورتها الأول)
// ------------------------------------------------------------
export async function cancelInstallmentInvoice(installmentId, user) {
  await assertModule("realEstate");
  const inst = await prisma.rentInstallment.findUnique({
    where: { id: installmentId },
    select: {
      id: true,
      saleId: true,
      carried: true,
      carriedToId: true,
      contract: { select: { branchId: true } },
    },
  });
  if (!inst || (!can(user, "allBranches.view") && inst.contract.branchId !== user.branch.id))
    throw new AppError("RentInstallmentNotFound");
  if (!inst.saleId) throw new AppError("RentInstallmentNotInvoiced");
  const carried = n(inst.carried);
  if (carried > 0 && inst.carriedToId) {
    const next = await prisma.rentInstallment.findUnique({
      where: { id: inst.carriedToId },
      select: { status: true, saleId: true },
    });
    if (next && (next.status !== "due" || next.saleId))
      throw new AppError("RentCarryInvoiced");
  }
  // حذف الفاتورة بنفس قيود فاتورة البيع (على فرع العقد)
  await deleteSale(inst.saleId, {
    ...user,
    branch: { ...user.branch, id: inst.contract.branchId },
  });
  await prisma.$transaction([
    prisma.rentInstallment.update({
      where: { id: inst.id },
      data: {
        status: "due",
        saleId: null,
        carried: 0,
        carriedToId: null,
        ...(carried > 0 ? { amount: { increment: carried } } : {}),
      },
    }),
    ...(carried > 0 && inst.carriedToId
      ? [
          prisma.rentInstallment.update({
            where: { id: inst.carriedToId },
            data: { amount: { decrement: carried } },
          }),
        ]
      : []),
  ]);
  return { id: inst.id };
}
