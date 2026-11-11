import "server-only";
import { docNumberWhere, nextBranchNumber } from "./sequence.service";
import { partyInBranch } from "@/lib/party-scope";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { assertUnitQty } from "./unit.service";
import { can } from "@/lib/permissions";
import { calcInvoice, round } from "@/lib/invoice-calc";
import { dayOf, dayToDbDate, dbDateToDay, today } from "@/lib/dates";
import {
  getBranchSaleContext,
  saleProductSelect,
  toSaleProduct,
} from "./sale-catalog.service";
import { getBaseCurrency } from "./currency.service";
import { assertNoCodesInNumbers } from "./scan-guard.service";
import { getActivePromotions } from "./promotion.service";
import { applyPromotions } from "@/lib/promotions";

// ============================================================
// عروض الأسعار: نفس حساب فاتورة البيع، بدون مخزون ولا مدفوعات
// - العميل من العملاء أو اسم يُكتب يدوياً
// - "تحويل لفاتورة" يفتح فاتورة البيع بأصنافه، وبعد الحفظ يتعلّم "تم تحويله"
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));
const EPS = 0.0001;
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

const branchScope = (user) =>
  can(user, "allBranches.view") ? {} : { branchId: user.branch.id };

async function prepareQuotation(data, user, existing = null) {
  // باركود اتكتب مكان الكمية/السعر (رقم من 7 أرقام أو أكتر) ← مفيش حفظ
  assertNoCodesInNumbers(data.items);
  const [currency, ctx] = await Promise.all([
    getBaseCurrency(),
    getBranchSaleContext(existing?.branchId ?? user.branch.id),
  ]);
  const decimals = currency.decimals ?? 2;

  // ---------- العميل ----------
  let customer = null;
  if (data.customerId) {
    customer = await prisma.customer.findFirst({
      where: {
        id: data.customerId,
        ...(existing?.customerId === data.customerId
          ? {}
          : {
              isActive: true,
              // العميل لازم يكون متاح في فرع العرض
              ...partyInBranch(existing?.branchId ?? user.branch.id),
            }),
      },
      select: { id: true, arName: true, enName: true, taxNo: true },
    });
    if (!customer) {
      throw new AppError("CustomerNotFound", null, {
        customerId: "CustomerNotFound",
      });
    }
  }
  if (data.validUntil < today()) {
    throw new AppError("ValidUntilPast", null, {
      validUntil: "ValidUntilPast",
    });
  }

  // ---------- الأصناف ----------
  const products = await prisma.product.findMany({
    where: {
      id: { in: [...new Set(data.items.map((i) => i.productId))] },
      OR: [{ isActive: true }, { id: { in: existing?.productIds ?? [] } }],
    },
    select: saleProductSelect(ctx),
  });
  const byId = new Map(products.map((p) => [p.id, toSaleProduct(p)]));
  const oldPrice = new Map(
    (existing?.items ?? []).map((i) => [
      `${i.productId}:${i.unitId}`,
      n(i.price),
    ]),
  );
  // تغيير السعر في العرض: صلاحية العرض أو صلاحية البيع
  const canChangePrice =
    can(user, "quotations.changePrice") || can(user, "sales.changePrice");

  const items = data.items.map((it, i) => {
    const product = byId.get(it.productId);
    if (!product) {
      throw new AppError("ProductNotFound", null, {
        [`items.${i}.productId`]: "ProductNotFound",
      });
    }
    const unit = product.units.find((u) => u.unit.id === it.unitId);
    if (!unit) throw new AppError("InvalidUnit");
    const price = round(it.price, 4);
    const allowed =
      canChangePrice ||
      Math.abs(price - unit.price) < EPS ||
      Math.abs((oldPrice.get(`${product.id}:${unit.unit.id}`) ?? -1) - price) <
        EPS;
    if (!allowed) {
      throw new AppError("PriceChangeNotAllowed", [
        { arName: product.arName, enName: product.enName },
      ]);
    }
    return {
      ...it,
      price,
      product,
      factor: unit.factor,
      taxRate: product.taxRate,
      taxMode: product.priceIncludesTax ? "inclusive" : "exclusive",
    };
  });
  // الوحدة متقبلش كسور (حبة) ← الكمية لازم رقم صحيح
  await assertUnitQty(
    items.map((it) => ({
      productId: it.product.id,
      unitId: it.unitId,
      qty: it.qty,
      factor: it.factor,
    })),
  );

  // العروض الشغالة يوم العرض (السيرفر يحسبها بنفسه)
  const promos = await getActivePromotions(
    existing?.branchId ?? user.branch.id,
    existing?.date ? dayOf(existing.date) : today(),
  );
  const applied = applyPromotions({
    items: items.map((it) => ({ ...it, categoryId: it.product.categoryId })),
    promos,
    discountType: data.discountType,
    discountValue: data.discountValue,
    decimals,
  });

  // الخصم اليدوي بصلاحية (خصم العروض لا يحتاج صلاحية)
  const hasDiscount =
    (!applied.invoicePromo && n(data.discountValue) > 0) ||
    applied.items.some((l) => !l.promotionId && n(l.discountValue) > 0);
  const canDiscount =
    can(user, "quotations.discount") || can(user, "sales.discount");
  if (hasDiscount && !canDiscount && !existing) {
    throw new AppError("DiscountNotAllowed");
  }

  const { lines, totals } = calcInvoice({
    items: applied.items,
    taxMode: "exclusive",
    discountType: applied.discountType,
    discountValue: applied.discountValue,
    decimals,
  });

  const name = data.customerName?.trim() || null;
  return {
    header: {
      customerId: customer?.id ?? null,
      customerArName: customer?.arName ?? name,
      customerEnName: customer?.enName ?? name,
      customerTaxNo: customer?.taxNo ?? null,
      validUntil: dayToDbDate(data.validUntil),
      discountType: applied.discountType,
      discountValue: applied.discountValue,
      promotionId: applied.invoicePromotionId,
      subtotal: totals.subtotal,
      itemsDiscount: totals.itemsDiscount,
      invoiceDiscount: totals.invoiceDiscount,
      netAmount: totals.net,
      taxAmount: totals.tax,
      totalAmount: totals.total,
      notes: data.notes,
    },
    itemRows: lines.map((l) => ({
      productId: l.product.id,
      code: l.product.code,
      arName: l.product.arName,
      enName: l.product.enName,
      note: l.note ?? null,
      unitId: l.unitId,
      factor: l.factor,
      qty: l.qty,
      price: l.price,
      priceIncludesTax: l.taxMode === "inclusive",
      discountType: l.discountType,
      discountValue: l.discountValue,
      itemDiscount: l.itemDiscount,
      invoiceDiscount: l.invoiceDiscount,
      taxRate: l.taxRate,
      netAmount: l.net,
      taxAmount: l.tax,
      totalAmount: l.total,
      promotionId: l.promotionId ?? null,
    })),
  };
}

export async function createQuotation(data, user) {
  const { header, itemRows } = await prepareQuotation(data, user);
  return prisma.$transaction(async (tx) => {
    // الرقم التالي في فرع العرض + رمز الفرع (DM-QT-5) - مفيش تكرار
    const { number, docCode } = await nextBranchNumber(
      tx,
      "quotation",
      user.branch.id,
    );
    return tx.quotation.create({
      data: {
        ...header,
        number,
        docCode,
        status: "open",
        branchId: user.branch.id,
        date: new Date(),
        createdById: user.id,
        items: { create: itemRows },
      },
      select: { id: true, number: true, docCode: true },
    });
  }, TX_OPTIONS);
}

async function findOpen(id, user) {
  const q = await prisma.quotation.findFirst({
    where: { id, ...branchScope(user) },
    select: {
      id: true,
      status: true,
      branchId: true,
      customerId: true,
      date: true,
      items: { select: { productId: true, unitId: true, price: true } },
    },
  });
  if (!q) throw new AppError("QuotationNotFound");
  if (q.status !== "open") throw new AppError("QuotationConverted");
  return q;
}

export async function updateQuotation({ id, ...data }, user) {
  const existing = await findOpen(id, user);
  const { header, itemRows } = await prepareQuotation(data, user, {
    ...existing,
    productIds: existing.items.map((i) => i.productId),
  });
  return prisma.quotation.update({
    where: { id },
    data: { ...header, items: { deleteMany: {}, create: itemRows } },
    select: { id: true, number: true, docCode: true },
  });
}

export async function deleteQuotation(id, user) {
  await findOpen(id, user);
  await prisma.quotation.delete({ where: { id } });
  return { deleted: 1 };
}

export async function listQuotations({
  q = "",
  page = 1,
  pageSize = 20,
  user,
}) {
  const query = q.trim();
  const asNumber = await docNumberWhere(query, user);
  const where = {
    ...branchScope(user),
    ...(query
      ? {
          OR: [
            ...(asNumber ? [asNumber] : []),
            { customerArName: { contains: query } },
            { customerEnName: { contains: query } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.quotation.count({ where }),
    prisma.quotation.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true, docCode: true,
        status: true,
        date: true,
        validUntil: true,
        customerArName: true,
        customerEnName: true,
        totalAmount: true,
        sale: { select: { id: true, number: true, docCode: true } },
      },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    rows: rows.map((r) => ({ ...r, validUntil: dbDateToDay(r.validUntil) })),
  };
}

export async function getQuotation(id, user) {
  const q = await prisma.quotation.findFirst({
    where: { id, ...branchScope(user) },
    select: {
      id: true,
      number: true, docCode: true,
      status: true,
      date: true,
      validUntil: true,
      customerId: true,
      customerArName: true,
      customerEnName: true,
      customerTaxNo: true,
      discountType: true,
      discountValue: true,
      subtotal: true,
      itemsDiscount: true,
      invoiceDiscount: true,
      netAmount: true,
      taxAmount: true,
      totalAmount: true,
      notes: true,
      branch: {
        select: {
          id: true,
          arName: true,
          enName: true,
          phone: true,
          registrationNo: true,
          city: true,
          district: true,
          street: true,
          buildingNo: true,
          additionalNo: true,
          postalCode: true,
        },
      },
      createdBy: { select: { arFullname: true, enFullname: true } },
      customer: { select: { id: true, code: true, phone: true } },
      sale: { select: { id: true, number: true, docCode: true } },
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          productId: true,
          code: true,
          arName: true,
          enName: true,
          note: true,
          unit: { select: { id: true, arName: true, enName: true } },
          factor: true,
          qty: true,
          price: true,
          priceIncludesTax: true,
          discountType: true,
          discountValue: true,
          itemDiscount: true,
          invoiceDiscount: true,
          taxRate: true,
          netAmount: true,
          taxAmount: true,
          totalAmount: true,
        },
      },
    },
  });
  if (!q) return null;
  return { ...q, validUntil: dbDateToDay(q.validUntil) };
}

// عرض السعر لشاشة التعديل أو التحويل: الأصناف بوحداتها وأسعارها الحالية
export async function getQuotationForForm(id, user) {
  const q = await getQuotation(id, user);
  if (!q) return null;
  const ctx = await getBranchSaleContext(q.branch.id);
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(q.items.map((i) => i.productId))] } },
    select: saleProductSelect(ctx),
  });
  const byId = new Map(products.map((p) => [p.id, toSaleProduct(p)]));
  return {
    ...q,
    items: q.items.map((i) => ({ ...i, product: byId.get(i.productId) })),
  };
}
