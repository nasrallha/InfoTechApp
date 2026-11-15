import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { assertModule } from "@/lib/modules";
import { dbDateToDay, dayEnd, dayStart, dayToDbDate, today } from "@/lib/dates";
import { formatDocNo, saleDocNo } from "@/lib/doc-number";
import { productTax } from "@/lib/zatca-tax";
import { OPEN_STATUSES } from "@/lib/tailoring";
import { partyInBranch } from "@/lib/party-scope";
import { createSaleSchema, updateSaleSchema } from "@/validations/sale.schema";
import { findOrCreate } from "./product.service";
import { createSale, deleteSale, previewSaleTotals, updateSale } from "./sale.service";
import { afterSaleSaved } from "./zatca-invoice.service";
import { getSystemSettings } from "./system-settings.service";
import { createVoucher } from "./voucher.service";
import { docNumberWhere, nextBranchNumber } from "./sequence.service";
import { cleanMeasures, resolveTailorCustomer } from "./tailoring.service";

// ============================================================
// طلبات التفصيل (وحدة tailoring)
// - الطلب: عميل + سطور (شخص + مقاساته + تفاصيل التفصيلة + القماش + عدد الثياب)
// - الفاتورة وقت الطلب (آجل على العميل): سطر القماش (صنف بمخزون بالمتر)
//   + سطر التفصيل (خدمة «تفصيل ثوب») عليه الخياط ← تقرير عمولات مقدمي الخدمة
// - العربون: مدفوع على الفاتورة نفسها، والباقي بسند قبض (عند التسليم أو بعده)
// - المقاسات والتفاصيل بتتحفظ نسخة في الطلب (تعديل الإعدادات مبيغيرش القديم)
// - المقاس اللي اتعدل في الطلب بيتسجل مقاس جديد للشخص (السجل بيفضل)
// ============================================================

const MODULE = "tailoring";
const n = (v) => (v == null ? 0 : Number(v));
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const day = (d) => (d ? dbDateToDay(d) : null);
const PAGE_SIZE = 50;

const branchScope = (user) =>
  can(user, "allBranches.view") ? {} : { branchId: user.branch.id };

// الفاتورة على فرع الطلب، والسعر من الطلب والآجل على العميل (بصلاحية الطلب)
const actingUser = (user, branchId) => ({
  ...user,
  branch: { ...user.branch, id: branchId },
  permissions: [
    ...(user.permissions ?? []),
    "sales.create",
    "sales.changePrice",
    "sales.credit",
    "sales.discount",
  ],
});

// خدمة «تفصيل ثوب» - بتتعمل أول مرة (السعر شامل الضريبة بنسبة الشركة)
const SEW_PRODUCT = { code: "TAILOR-SEW", arName: "تفصيل ثوب", enName: "Thobe tailoring" };

async function sewProduct() {
  const found = await prisma.product.findUnique({
    where: { code: SEW_PRODUCT.code },
    select: { id: true, baseUnitId: true },
  });
  if (found) return found;
  const [unitId, categoryId, settings] = await Promise.all([
    findOrCreate("unit", "خدمة", "Service"),
    findOrCreate("category", "خدمات", "Services"),
    getSystemSettings(),
  ]);
  const taxRate = Number(settings.taxRate ?? 15);
  const tax = productTax({
    taxRate,
    taxCategory: taxRate > 0 ? "S" : "E",
    taxExemptionCode: null,
  });
  try {
    return await prisma.product.create({
      data: {
        ...SEW_PRODUCT,
        categoryId,
        baseUnitId: unitId,
        isService: true,
        cost: 0,
        price: 0,
        taxRate,
        isPriceIncludeTax: true,
        ...tax,
      },
      select: { id: true, baseUnitId: true },
    });
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    return prisma.product.findUnique({
      where: { code: SEW_PRODUCT.code },
      select: { id: true, baseUnitId: true },
    });
  }
}

// ------------------------------------------------------------
// خيارات شاشة الطلب: الخانات، التفاصيل، الأقمشة، الخياطين، سعر التفصيل
// ------------------------------------------------------------
export async function tailorOrderOptions() {
  await assertModule(MODULE);
  const settings = await prisma.systemSettings.findUnique({
    where: { id: 1 },
    select: { tailorSewPrice: true, tailorFabricCategoryId: true, tailorDeliveryDays: true },
  });
  const catId = settings?.tailorFabricCategoryId ?? null;
  const [fields, groups, fabrics, technicians] = await Promise.all([
    prisma.tailorField.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, arName: true, enName: true },
    }),
    prisma.tailorStyleGroup.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        arName: true,
        enName: true,
        multiple: true,
        choices: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: { id: true, arName: true, enName: true, image: true, part: true },
        },
      },
    }),
    prisma.product.findMany({
      where: {
        isActive: true,
        isService: false,
        ...(catId ? { OR: [{ categoryId: catId }, { category: { parentId: catId } }] } : {}),
      },
      orderBy: { code: "asc" },
      take: 2000,
      select: {
        id: true,
        code: true,
        arName: true,
        enName: true,
        price: true,
        baseUnit: { select: { arName: true, enName: true } },
      },
    }),
    prisma.technician.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, arName: true, enName: true },
    }),
  ]);
  return {
    fields,
    groups: groups.filter((g) => g.choices.length),
    fabrics: fabrics.map((f) => ({ ...f, price: n(f.price) })),
    technicians,
    sewPrice: n(settings?.tailorSewPrice),
    deliveryDays: settings?.tailorDeliveryDays ?? 7,
  };
}

// ------------------------------------------------------------
// تجهيز الطلب: التحقق + نسخ المقاسات والتفاصيل + بيانات الفاتورة
// persist: يسجل الأشخاص الجداد والمقاسات المتعدلة (الحفظ بس، مش المعاينة)
// ------------------------------------------------------------
async function prepareOrder(data, user, { persist }) {
  const customer = persist
    ? await resolveTailorCustomer(data, user)
    : data.customerId
      ? await prisma.customer.findUnique({ where: { id: data.customerId }, select: { id: true } })
      : null;

  const [fields, groups, sew] = await Promise.all([
    prisma.tailorField.findMany({ select: { id: true, arName: true, enName: true } }),
    prisma.tailorStyleGroup.findMany({
      select: {
        id: true,
        arName: true,
        enName: true,
        multiple: true,
        choices: { select: { id: true, arName: true, enName: true, image: true, part: true } },
      },
    }),
    sewProduct(),
  ]);
  const fieldById = new Map(fields.map((f) => [String(f.id), f]));
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const fabricIds = [...new Set(data.lines.map((l) => l.fabricId).filter(Boolean))];
  const fabrics = fabricIds.length
    ? await prisma.product.findMany({
        where: { id: { in: fabricIds }, isActive: true, isService: false },
        select: { id: true, arName: true, baseUnitId: true },
      })
    : [];
  const fabricById = new Map(fabrics.map((f) => [f.id, f]));

  // الأشخاص الموجودين لازم يكونوا تبع العميل
  const personIds = [...new Set(data.lines.map((l) => l.personId).filter(Boolean))];
  const persons = personIds.length
    ? await prisma.tailorPerson.findMany({
        where: { id: { in: personIds }, ...(customer ? { customerId: customer.id } : {}) },
        select: {
          id: true,
          name: true,
          measurements: { orderBy: { id: "desc" }, take: 1, select: { id: true } },
        },
      })
    : [];
  const personById = new Map(persons.map((p) => [p.id, p]));

  const lines = [];
  for (const [i, l] of data.lines.entries()) {
    // ---------- الشخص ----------
    let person = l.personId ? personById.get(l.personId) : null;
    if (l.personId && !person)
      throw new AppError("NotFound", null, { [`lines.${i}.personId`]: "NotFound" });
    // المعاينة (حساب الإجمالي): الاسم مش مهم ← من غير ما نوقف
    const personName = person?.name ?? (l.personName?.trim() || (persist ? "" : "-"));
    if (!personName)
      throw new AppError("RequiredField", null, { [`lines.${i}.personName`]: "RequiredField" });

    // ---------- المقاسات ----------
    const values = cleanMeasures(l.measures);
    const measures = Object.entries(values)
      .filter(([k]) => fieldById.has(k))
      .map(([k, value]) => {
        const f = fieldById.get(k);
        return { id: f.id, arName: f.arName, enName: f.enName, value };
      });

    // ---------- التفاصيل ----------
    const styles = [];
    for (const s of l.styles) {
      if (!s.choiceIds.length) continue;
      const g = groupById.get(s.groupId);
      if (!g) throw new AppError("NotFound");
      const ids = g.multiple ? [...new Set(s.choiceIds)] : s.choiceIds.slice(0, 1);
      const choices = ids.map((id) => {
        const c = g.choices.find((x) => x.id === id);
        if (!c) throw new AppError("NotFound");
        return c;
      });
      styles.push({ id: g.id, arName: g.arName, enName: g.enName, choices });
    }

    // ---------- القماش ----------
    const fabric = l.fabricId ? fabricById.get(l.fabricId) : null;
    if (l.fabricId && !fabric)
      throw new AppError("ProductNotFound", null, { [`lines.${i}.fabricId`]: "ProductNotFound" });
    if (fabric && !(l.fabricQty > 0) && persist)
      throw new AppError("RequiredField", null, { [`lines.${i}.fabricQty`]: "RequiredField" });

    lines.push({ src: l, person, personName, values, measures, styles, fabric });
  }

  // ---------- الفاتورة: القماش + التفصيل لكل سطر ----------
  const items = [];
  for (const x of lines) {
    // المعاينة: القماش من غير كمية لسه ← مش داخل في الإجمالي
    if (x.fabric && x.src.fabricQty > 0)
      items.push({
        productId: x.fabric.id,
        unitId: x.fabric.baseUnitId,
        qty: x.src.fabricQty,
        price: x.src.fabricPrice,
        note: x.personName.slice(0, 500),
      });
    items.push({
      productId: sew.id,
      unitId: sew.baseUnitId,
      qty: x.src.pieces,
      price: x.src.sewPrice,
      note: x.personName.slice(0, 500),
      ...(data.technicianId ? { job: { technicianId: data.technicianId } } : {}),
    });
  }
  const pay = data.payment;
  const deposit = pay?.paymentMethodId && pay.amount > 0 ? pay.amount : 0;
  const sale = {
    source: "invoice",
    customerId: customer?.id,
    discountType: data.discountType ?? "amount",
    discountValue: data.discountValue ?? 0,
    requestId: data.requestId ?? null,
    items,
    payments: deposit
      ? [{ paymentMethodId: pay.paymentMethodId, amount: deposit, reference: pay.reference ?? null }]
      : [],
  };
  return { customer, lines, sale, deposit };
}

// المعاينة: إجمالي الفاتورة شامل الضريبة (عشان العربون)
export async function previewTailorOrder(data, user) {
  await assertModule(MODULE);
  const { sale } = await prepareOrder(
    { ...data, payment: null, requestId: null },
    user,
    { persist: false },
  );
  if (!sale.customerId) {
    // عميل جديد: المعاينة على أي عميل متاح في الفرع (الإجمالي مش بيعتمد على العميل)
    const any = await prisma.customer.findFirst({
      where: { isActive: true, ...partyInBranch(user.branch.id) },
      select: { id: true },
    });
    if (!any) return { total: 0 };
    sale.customerId = any.id;
  }
  const { total } = await previewSaleTotals(createSaleSchema.parse(sale), actingUser(user, user.branch.id));
  return { total };
}

// ------------------------------------------------------------
// طلب جديد: الأشخاص والمقاسات ← الفاتورة ← الطلب برقمه
// ------------------------------------------------------------
export async function createTailorOrder(data, user) {
  await assertModule(MODULE);
  if (data.deliveryDate < today())
    throw new AppError("TailorDeliveryPast", null, { deliveryDate: "TailorDeliveryPast" });
  if (data.technicianId) {
    const t = await prisma.technician.findUnique({ where: { id: data.technicianId }, select: { id: true } });
    if (!t) throw new AppError("TechnicianNotFound");
  }
  const prep = await prepareOrder(data, user, { persist: true });
  const { customer } = prep;
  const saved = await savePersonsAndMeasures(prep, customer, user);

  // الفاتورة (آجل على العميل، والعربون مدفوع عليها)
  const branchId = user.branch.id;
  const acting = actingUser(user, branchId);
  const created = await createSale(createSaleSchema.parse({ ...prep.sale, customerId: customer.id }), acting);
  const sale = await prisma.sale.findUnique({
    where: { id: created.id },
    select: { totalAmount: true },
  });

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const { number, docCode } = await nextBranchNumber(tx, "tailorOrder", branchId);
      return tx.tailorOrder.create({
        data: {
          number,
          docCode,
          branchId,
          customerId: customer.id,
          deliveryDate: dayToDbDate(data.deliveryDate),
          technicianId: data.technicianId ?? null,
          saleId: created.id,
          totalAmount: n(sale?.totalAmount),
          notes: data.notes ?? null,
          createdById: user.id,
          lines: { create: saved.map(lineRow) },
        },
        select: { id: true, number: true, docCode: true },
      });
    });
  } catch (error) {
    // الطلب متسجلش ← الفاتورة تتشال
    await deleteSale(created.id, acting).catch(() => {});
    throw error;
  }
  // الزكاة (لو الفرع مربوط): نفس اللي بيحصل بعد حفظ أي فاتورة بيع
  const zatca = await afterSaleSaved(created.id, {}).catch(() => null);
  return {
    id: order.id,
    docNo: formatDocNo("tailorOrder", order.number, order.docCode),
    saleId: created.id,
    zatca,
  };
}

// سطر الطلب للحفظ (نسخة المقاسات والتفاصيل)
const lineRow = (x) => ({
  personId: x.person.id,
  personName: x.personName,
  measurementId: x.measurementId,
  measures: x.measures,
  styles: x.styles,
  fabricId: x.fabric?.id ?? null,
  fabricName: x.fabric?.arName ?? null,
  fabricQty: x.fabric ? x.src.fabricQty : 0,
  fabricPrice: x.fabric ? x.src.fabricPrice : 0,
  pieces: x.src.pieces,
  sewPrice: x.src.sewPrice,
  notes: x.src.notes ?? null,
});

// الأشخاص الجداد + المقاسات اللي اتغيرت (سجل جديد للشخص)
async function savePersonsAndMeasures(prep, customer, user) {
  const saved = [];
  for (const x of prep.lines) {
    let person = x.person;
    if (!person) {
      person = await prisma.tailorPerson.create({
        data: { customerId: customer.id, name: x.personName, kinship: x.src.kinship },
        select: { id: true, name: true },
      });
    }
    let measurementId = null;
    if (Object.keys(x.values).length) {
      const chosen = x.src.measurementId
        ? await prisma.tailorMeasurement.findFirst({
            where: { id: x.src.measurementId, personId: person.id },
            select: { id: true, measures: true },
          })
        : null;
      // نفس قيم المقاس المختار ← نفس المقاس (من غير سجل جديد)
      const key = (m) => JSON.stringify(Object.entries(cleanMeasures(m)).sort());
      const same = chosen && key(chosen.measures) === key(x.values);
      measurementId = same
        ? chosen.id
        : (
            await prisma.tailorMeasurement.create({
              data: { personId: person.id, measures: x.values, takenById: user.id },
              select: { id: true },
            })
          ).id;
    }
    saved.push({ ...x, person, measurementId });
  }
  return saved;
}

// ------------------------------------------------------------
// تعديل الطلب (صلاحية tailorOrders.update): نفس الرقم ونفس الفاتورة
// - الأشخاص والمقاسات والتفاصيل والقماش والأسعار والخصم والعربون
// - الفاتورة بتتعدل بنفس قيود تعديل فاتورة البيع (الموقّعة للزكاة أو اللي
//   عليها سندات قبض مقفولة ← التصحيح بمرتجع)
// - الطلب المسلَّم أو الملغي مبيتعدلش
// ------------------------------------------------------------
export async function updateTailorOrder({ id, ...data }, user) {
  await assertModule(MODULE);
  const o = await loadOrder(id, user);
  if (!OPEN_STATUSES.includes(o.status)) throw new AppError("TailorOrderNotOpen");
  if (data.technicianId) {
    const t = await prisma.technician.findUnique({ where: { id: data.technicianId }, select: { id: true } });
    if (!t) throw new AppError("TechnicianNotFound");
  }
  const prep = await prepareOrder({ ...data, customerId: data.customerId ?? o.customerId }, user, { persist: true });
  const { customer } = prep;
  const saved = await savePersonsAndMeasures(prep, customer, user);
  const acting = actingUser(user, o.branchId);
  acting.permissions.push("sales.update");
  if (o.saleId) {
    // التعديل من غير بصمة حفظ (requestId للإضافة بس)
    const saleData = { ...prep.sale, customerId: customer.id, id: o.saleId };
    delete saleData.requestId;
    await updateSale(updateSaleSchema.parse(saleData), acting);
  }
  const sale = o.saleId
    ? await prisma.sale.findUnique({ where: { id: o.saleId }, select: { totalAmount: true } })
    : null;
  await prisma.$transaction([
    prisma.tailorOrderLine.deleteMany({ where: { orderId: id } }),
    prisma.tailorOrder.update({
      where: { id },
      data: {
        customerId: customer.id,
        deliveryDate: dayToDbDate(data.deliveryDate),
        technicianId: data.technicianId ?? null,
        totalAmount: n(sale?.totalAmount),
        notes: data.notes ?? null,
        lines: { create: saved.map(lineRow) },
      },
    }),
  ]);
  const zatca = o.saleId ? await afterSaleSaved(o.saleId, {}).catch(() => null) : null;
  return { id, docNo: formatDocNo("tailorOrder", o.number, o.docCode), saleId: o.saleId, zatca };
}

// ------------------------------------------------------------
// حذف الطلب نهائياً (صلاحية tailorOrders.delete): الطلب وفاتورته
// - الفاتورة بنفس قيود حذف فاتورة البيع (الموقّعة / عليها سندات / بعد
//   الإرسال الفعلي للزكاة ← ممنوع، والتصحيح بمرتجع)
// ------------------------------------------------------------
export async function deleteTailorOrder(id, user) {
  await assertModule(MODULE);
  const o = await loadOrder(id, user);
  if (o.saleId) await deleteSale(o.saleId, { ...user, branch: { ...user.branch, id: o.branchId } });
  await prisma.tailorOrder.delete({ where: { id } });
  return { id };
}

// الطلب لشاشة التعديل: السطور بأرقام (الشخص / المقاس / القيم / التفاصيل / القماش)
// + الخصم والعربون من الفاتورة
export async function getTailorOrderForEdit(id, user) {
  await assertModule(MODULE);
  const o = await prisma.tailorOrder.findFirst({
    where: { id, ...branchScope(user) },
    select: {
      id: true,
      number: true,
      docCode: true,
      status: true,
      customerId: true,
      deliveryDate: true,
      technicianId: true,
      notes: true,
      sale: {
        select: {
          totalAmount: true,
          discountType: true,
          discountValue: true,
          payments: { take: 1, select: { paymentMethodId: true, amount: true, reference: true } },
        },
      },
      lines: {
        orderBy: { id: "asc" },
        select: {
          personId: true,
          personName: true,
          measurementId: true,
          measures: true,
          styles: true,
          fabricId: true,
          fabricQty: true,
          fabricPrice: true,
          pieces: true,
          sewPrice: true,
          notes: true,
        },
      },
    },
  });
  if (!o) return null;
  const pay = o.sale?.payments[0];
  return {
    id: o.id,
    docNo: formatDocNo("tailorOrder", o.number, o.docCode),
    status: o.status,
    customerId: o.customerId,
    deliveryDate: day(o.deliveryDate),
    technicianId: o.technicianId,
    notes: o.notes ?? "",
    discountType: o.sale?.discountType ?? "amount",
    discountValue: n(o.sale?.discountValue),
    total: n(o.sale?.totalAmount),
    payment: pay ? { paymentMethodId: pay.paymentMethodId, amount: n(pay.amount), reference: pay.reference ?? "" } : null,
    lines: o.lines.map((l) => ({
      personId: l.personId,
      personName: l.personName,
      measurementId: l.measurementId,
      measures: Object.fromEntries((Array.isArray(l.measures) ? l.measures : []).map((m) => [String(m.id), m.value])),
      styles: Object.fromEntries(
        (Array.isArray(l.styles) ? l.styles : []).map((g) => [String(g.id), g.choices.map((c) => c.id)]),
      ),
      fabricId: l.fabricId,
      fabricQty: n(l.fabricQty),
      fabricPrice: n(l.fabricPrice),
      pieces: l.pieces,
      sewPrice: n(l.sewPrice),
      notes: l.notes ?? "",
    })),
  };
}

// ------------------------------------------------------------
// المدفوع والباقي من الفاتورة (العربون + سندات القبض)
// ------------------------------------------------------------
const saleSel = {
  id: true,
  type: true,
  number: true,
  docCode: true,
  totalAmount: true,
  remainingAmount: true,
  settledAmount: true,
  invoiceDiscount: true,
};
const money = (sale) => {
  if (!sale) return { total: 0, paid: 0, due: 0, discount: 0 };
  const total = n(sale.totalAmount);
  const due = Math.max(0, r2(n(sale.remainingAmount) - n(sale.settledAmount)));
  return { total, paid: r2(total - due), due, discount: n(sale.invoiceDiscount) };
};

const orderRow = (o) => ({
  id: o.id,
  docNo: formatDocNo("tailorOrder", o.number, o.docCode),
  orderDate: o.orderDate.toISOString(),
  deliveryDate: day(o.deliveryDate),
  status: o.status,
  late: OPEN_STATUSES.includes(o.status) && day(o.deliveryDate) < today(),
  customer: o.customer,
  technician: o.technician,
  branch: o.branch,
  persons: [...new Set(o.lines.map((l) => l.personName))],
  pieces: o.lines.reduce((s, l) => s + l.pieces, 0),
  sale: o.sale ? { ...o.sale, docNo: saleDocNo(o.sale.type, o.sale.number, o.sale.docCode) } : null,
  ...money(o.sale),
});

// ------------------------------------------------------------
// قائمة الطلبات: بحث (الرقم / العميل / الجوال / الشخص) + فترة + حالة + خياط
// ------------------------------------------------------------
export async function listTailorOrders(f, user) {
  await assertModule(MODULE);
  const text = f.q?.trim();
  const ref = text ? await docNumberWhere(text, user) : null;
  const dateKey = f.dateBy === "delivery" ? "deliveryDate" : "orderDate";
  const range =
    f.from || f.to
      ? {
          [dateKey]:
            dateKey === "deliveryDate"
              ? {
                  ...(f.from ? { gte: dayToDbDate(f.from) } : {}),
                  ...(f.to ? { lte: dayToDbDate(f.to) } : {}),
                }
              : {
                  ...(f.from ? { gte: dayStart(f.from) } : {}),
                  ...(f.to ? { lte: dayEnd(f.to) } : {}),
                },
        }
      : {};
  const statusWhere =
    f.status === "all"
      ? {}
      : f.status === "open"
        ? { status: { in: OPEN_STATUSES } }
        : f.status === "late"
          ? { status: { in: OPEN_STATUSES }, deliveryDate: { lt: dayToDbDate(today()) } }
          : { status: f.status };
  const where = {
    ...branchScope(user),
    ...statusWhere,
    ...range,
    ...(f.technicianId ? { technicianId: f.technicianId } : {}),
    ...(text
      ? {
          OR: [
            ...(ref ? [ref] : []),
            { customer: { arName: { contains: text } } },
            { customer: { enName: { contains: text } } },
            { customer: { phone: { contains: text } } },
            { lines: { some: { personName: { contains: text } } } },
          ],
        }
      : {}),
  };
  const [total, rows, counts] = await Promise.all([
    prisma.tailorOrder.count({ where }),
    prisma.tailorOrder.findMany({
      where,
      orderBy: f.status === "open" || f.status === "late" ? [{ deliveryDate: "asc" }, { id: "asc" }] : { id: "desc" },
      // التصدير: كل المطابق (لحد 10000)
      skip: f.all ? 0 : (f.page - 1) * PAGE_SIZE,
      take: f.all ? 10000 : PAGE_SIZE,
      select: {
        id: true,
        number: true,
        docCode: true,
        orderDate: true,
        deliveryDate: true,
        status: true,
        customer: { select: { id: true, code: true, arName: true, enName: true, phone: true } },
        technician: { select: { id: true, arName: true, enName: true } },
        branch: { select: { id: true, arName: true, enName: true } },
        lines: { select: { personName: true, pieces: true } },
        sale: { select: saleSel },
      },
    }),
    // عدد كل حالة (الأزرار) في نفس الفترة والبحث
    prisma.tailorOrder.groupBy({
      by: ["status"],
      where: { ...where, status: undefined, deliveryDate: range.deliveryDate },
      _count: { _all: true },
    }),
  ]);
  const late = await prisma.tailorOrder.count({
    where: {
      ...where,
      status: { in: OPEN_STATUSES },
      deliveryDate: { lt: dayToDbDate(today()), ...(range.deliveryDate ?? {}) },
    },
  });
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  return {
    total,
    page: f.page,
    pageSize: PAGE_SIZE,
    rows: rows.map(orderRow),
    counts: {
      ...byStatus,
      open: OPEN_STATUSES.reduce((s, k) => s + (byStatus[k] ?? 0), 0),
      all: Object.values(byStatus).reduce((s, v) => s + v, 0),
      late,
    },
  };
}

// ------------------------------------------------------------
// الطلب كامل (التفاصيل والطباعة)
// ------------------------------------------------------------
export async function getTailorOrder(id, user) {
  await assertModule(MODULE);
  const o = await prisma.tailorOrder.findFirst({
    where: { id, ...branchScope(user) },
    select: {
      id: true,
      number: true,
      docCode: true,
      orderDate: true,
      deliveryDate: true,
      status: true,
      notes: true,
      readyAt: true,
      deliveredAt: true,
      cancelledAt: true,
      cancelReason: true,
      customer: { select: { id: true, code: true, arName: true, enName: true, phone: true } },
      technician: { select: { id: true, arName: true, enName: true } },
      branch: { select: { id: true, arName: true, enName: true } },
      createdBy: { select: { arFullname: true, enFullname: true } },
      sale: { select: saleSel },
      lines: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          personId: true,
          personName: true,
          measures: true,
          styles: true,
          fabricName: true,
          fabricQty: true,
          fabricPrice: true,
          pieces: true,
          sewPrice: true,
          notes: true,
        },
      },
    },
  });
  if (!o) return null;
  return {
    ...orderRow(o),
    notes: o.notes,
    readyAt: o.readyAt?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
    cancelReason: o.cancelReason,
    createdBy: o.createdBy,
    lines: o.lines.map((l) => ({
      ...l,
      measures: Array.isArray(l.measures) ? l.measures : [],
      styles: Array.isArray(l.styles) ? l.styles : [],
      fabricQty: n(l.fabricQty),
      fabricPrice: n(l.fabricPrice),
      sewPrice: n(l.sewPrice),
    })),
  };
}

async function loadOrder(id, user, select = {}) {
  const o = await prisma.tailorOrder.findFirst({
    where: { id, ...branchScope(user) },
    select: { id: true, status: true, branchId: true, customerId: true, saleId: true, number: true, docCode: true, ...select },
  });
  if (!o) throw new AppError("TailorOrderNotFound");
  return o;
}

// ------------------------------------------------------------
// الحالة: جديد / تحت التفصيل / جاهز (لطلبات مفتوحة بس)
// ------------------------------------------------------------
export async function setTailorOrderStatus({ ids, status }, user) {
  await assertModule(MODULE);
  const res = await prisma.tailorOrder.updateMany({
    where: { id: { in: ids }, status: { in: OPEN_STATUSES }, ...branchScope(user) },
    data: { status, ...(status === "ready" ? { readyAt: new Date() } : {}) },
  });
  if (!res.count) throw new AppError("TailorOrderNotOpen");
  return { updated: res.count };
}

// الخياط وموعد التسليم (الخياط بيتحط على سطور التفصيل في الفاتورة ← العمولات)
export async function assignTailorOrder({ id, technicianId, deliveryDate }, user) {
  await assertModule(MODULE);
  const o = await loadOrder(id, user);
  if (!OPEN_STATUSES.includes(o.status)) throw new AppError("TailorOrderNotOpen");
  if (technicianId) {
    const t = await prisma.technician.findUnique({ where: { id: technicianId }, select: { id: true } });
    if (!t) throw new AppError("TechnicianNotFound");
  }
  const sew = await sewProduct();
  await prisma.$transaction([
    prisma.tailorOrder.update({
      where: { id },
      data: {
        technicianId,
        ...(deliveryDate ? { deliveryDate: dayToDbDate(deliveryDate) } : {}),
      },
    }),
    ...(o.saleId
      ? [
          prisma.saleItem.updateMany({
            where: { saleId: o.saleId, productId: sew.id },
            data: { technicianId },
          }),
        ]
      : []),
  ]);
  return { id };
}

// ------------------------------------------------------------
// التسليم: تحصيل الباقي (اختياري) بسند قبض على العميل ← مُسلَّم
// ------------------------------------------------------------
// سند قبض على العميل باسم الطلب (على فرع الطلب)
async function collect(o, user, { paymentMethodId, amount, reference }) {
  const { due } = money(o.sale);
  if (amount > due + 0.009) throw new AppError("TailorAmountOverDue", { due });
  return createVoucher(
    {
      type: "receipt",
      partyType: "customer",
      customerId: o.customerId,
      paymentMethodId,
      amount,
      reference: reference ?? null,
      notes: formatDocNo("tailorOrder", o.number, o.docCode),
    },
    { ...user, branch: { ...user.branch, id: o.branchId } },
  );
}

// دفع المتبقي (أو جزء منه) - قبل التسليم أو بعده
export async function payTailorOrder({ id, paymentMethodId, amount, reference }, user) {
  await assertModule(MODULE);
  const o = await loadOrder(id, user, { sale: { select: saleSel } });
  if (o.status === "cancelled") throw new AppError("TailorOrderNotOpen");
  const voucher = await collect(o, user, { paymentMethodId, amount, reference });
  // سداد الباقي كله = العميل استلم ← الطلب «مُسلَّم» لوحده (من غير تغيير الحالة باليد)
  // (سداد جزء بس: الحالة زي ما هي)
  const paidAll = amount >= money(o.sale).due - 0.009;
  const delivered = paidAll && OPEN_STATUSES.includes(o.status);
  if (delivered)
    await prisma.tailorOrder.update({
      where: { id },
      data: { status: "delivered", deliveredAt: new Date() },
    });
  return { id, voucherId: voucher.id, delivered };
}

export async function deliverTailorOrder({ id, paymentMethodId, amount, reference }, user) {
  await assertModule(MODULE);
  const o = await loadOrder(id, user, { sale: { select: saleSel } });
  if (!OPEN_STATUSES.includes(o.status)) throw new AppError("TailorOrderNotOpen");
  const voucher =
    paymentMethodId && amount > 0 ? await collect(o, user, { paymentMethodId, amount, reference }) : null;
  await prisma.tailorOrder.update({
    where: { id },
    data: { status: "delivered", deliveredAt: new Date() },
  });
  return { id, voucherId: voucher?.id ?? null };
}

// ------------------------------------------------------------
// إلغاء الطلب: الفاتورة بتتحذف (بنفس قيود حذف فاتورة البيع:
// الموقّعة للزكاة / عليها سندات ← التصحيح بمرتجع)
// ------------------------------------------------------------
export async function cancelTailorOrder({ id, reason }, user) {
  await assertModule(MODULE);
  const o = await loadOrder(id, user);
  if (!OPEN_STATUSES.includes(o.status)) throw new AppError("TailorOrderNotOpen");
  if (o.saleId) await deleteSale(o.saleId, { ...user, branch: { ...user.branch, id: o.branchId } });
  await prisma.tailorOrder.update({
    where: { id },
    data: { status: "cancelled", cancelledAt: new Date(), cancelReason: reason ?? null },
  });
  return { id };
}

// ------------------------------------------------------------
// تقرير العميل (صلاحية tailoring.reports): العميل وأشخاصه ومقاساتهم
// + كل طلباته بتفاصيلها (لكل شخص: القماش والثياب والتفاصيل والمقاسات)
// + الإجماليات (الطلبات / الثياب / القيمة / المدفوع / المتبقي) ولكل شخص
// ------------------------------------------------------------
export async function tailorCustomerReport(customerId, user) {
  await assertModule(MODULE);
  const { getTailorCustomer } = await import("./tailoring.service");
  const customer = await getTailorCustomer(customerId);
  if (!customer) return null;
  const orders = await prisma.tailorOrder.findMany({
    where: { customerId, ...branchScope(user) },
    orderBy: { id: "desc" },
    take: 2000,
    select: {
      id: true,
      number: true,
      docCode: true,
      orderDate: true,
      deliveryDate: true,
      status: true,
      notes: true,
      customer: { select: { id: true, code: true, arName: true, enName: true, phone: true } },
      technician: { select: { id: true, arName: true, enName: true } },
      branch: { select: { id: true, arName: true, enName: true } },
      sale: { select: saleSel },
      lines: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          personId: true,
          personName: true,
          measures: true,
          styles: true,
          fabricName: true,
          fabricQty: true,
          pieces: true,
          sewPrice: true,
          notes: true,
        },
      },
    },
  });
  const rows = orders.map((o) => ({
    ...orderRow(o),
    notes: o.notes,
    lines: o.lines.map((l) => ({
      ...l,
      measures: Array.isArray(l.measures) ? l.measures : [],
      styles: Array.isArray(l.styles) ? l.styles : [],
      fabricQty: n(l.fabricQty),
      sewPrice: n(l.sewPrice),
    })),
  }));
  // الملغي مش داخل في المبالغ
  const live = rows.filter((r) => r.status !== "cancelled");
  const sum = (list, k) => r2(list.reduce((s, r) => s + r[k], 0));
  // لكل شخص: عدد الطلبات والثياب
  const byPerson = new Map();
  for (const r of live)
    for (const l of r.lines) {
      const key = l.personId ?? `n:${l.personName}`;
      const p = byPerson.get(key) ?? { name: l.personName, orders: new Set(), pieces: 0 };
      p.orders.add(r.id);
      p.pieces += l.pieces;
      byPerson.set(key, p);
    }
  return {
    customer,
    orders: rows,
    totals: {
      orders: live.length,
      pieces: live.reduce((s, r) => s + r.pieces, 0),
      total: sum(live, "total"),
      paid: sum(live, "paid"),
      due: sum(live, "due"),
      open: live.filter((r) => OPEN_STATUSES.includes(r.status)).length,
    },
    persons: [...byPerson.values()].map((p) => ({ name: p.name, orders: p.orders.size, pieces: p.pieces })),
  };
}
