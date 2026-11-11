import "server-only";
import { docNumberWhere, nextBranchNumber } from "./sequence.service";
import { prisma } from "@/lib/prisma";
import { runTx } from "@/lib/transaction";
import { AppError } from "@/lib/errors";
import { assertModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { dayToDbDate, today } from "@/lib/dates";
import {
  getBranchSaleContext,
  saleProductSelect,
  toSaleProduct,
} from "./sale-catalog.service";

// ============================================================
// طلبات الضمان والصيانة (وحدة warrantyClaims)
// - الاستلام: بالرقم التسلسلي (جهاز من عندنا) أو جهاز مكتوب بالاسم
// - المراحل: received → inspecting → at_agent → back → ready → delivered
//   (أو cancelled)، وكل نقلة بتتسجل في السجل
// - الاستبدال: القطعة الجديدة بتتسجل باسم العميل وبنفس نهاية الضمان
// - الفلوس: مفيش أي مبلغ قبل فاتورة الصيانة (القطع والمصنعية ← فاتورة بيع)
// ============================================================

const n = (v) => (v == null ? 0 : Number(v));

export const CLAIM_STATUSES = [
  "received",
  "inspecting",
  "at_agent",
  "back",
  "ready",
  "delivered",
  "cancelled",
];
// المسموح من كل مرحلة
const NEXT = {
  received: ["inspecting", "at_agent", "ready", "cancelled"],
  inspecting: ["at_agent", "ready", "cancelled"],
  at_agent: ["back", "cancelled"],
  back: ["inspecting", "ready"],
  ready: ["inspecting", "delivered"],
  delivered: [],
  cancelled: [],
};
export const nextStatuses = (status) => NEXT[status] ?? [];
const OPEN = ["received", "inspecting", "at_agent", "back", "ready"];

const branchScope = (user) =>
  can(user, "allBranches.view") ? {} : { branchId: user.branch.id };


const dateOnly = (d) => (d ? d.toISOString().slice(0, 10) : null);

// ------------------------------------------------------------
// البحث عن الجهاز بالرقم (لشاشة الاستلام)
// ------------------------------------------------------------
export async function lookupDevice(q) {
  await assertModule("warrantyClaims");
  const text = q.trim();
  if (!text) return null;
  const s = await prisma.productSerial.findFirst({
    where: { OR: [{ serial: text }, { serial2: text }] },
    orderBy: { id: "desc" },
    select: {
      id: true,
      serial: true,
      serial2: true,
      status: true,
      warrantyEndsAt: true,
      warrantyMonths: true,
      product: { select: { id: true, code: true, arName: true, enName: true } },
      customer: {
        select: {
          id: true,
          code: true,
          arName: true,
          enName: true,
          phone: true,
        },
      },
      saleItem: {
        select: {
          sale: {
            select: {
              id: true,
              number: true, docCode: true,
              date: true,
              customerArName: true,
              customerEnName: true,
            },
          },
        },
      },
    },
  });
  if (!s) return null;
  const ends = dateOnly(s.warrantyEndsAt);
  return {
    serialId: s.id,
    serial: s.serial,
    serial2: s.serial2,
    status: s.status,
    product: s.product,
    customer: s.customer,
    sale: s.saleItem?.sale ?? null,
    warrantyEndsAt: ends,
    inWarranty: s.status === "sold" && Boolean(ends) && ends >= today(),
  };
}

// ------------------------------------------------------------
// استلام جهاز (طلب جديد)
// ------------------------------------------------------------
export async function createClaim(data, user) {
  await assertModule("warrantyClaims");
  let serial = null;
  if (data.serialId) {
    serial = await prisma.productSerial.findUnique({
      where: { id: data.serialId },
      select: {
        id: true,
        serial: true,
        serial2: true,
        status: true,
        productId: true,
        customerId: true,
        warrantyEndsAt: true,
      },
    });
    if (!serial) throw new AppError("SerialNotFound");
  }
  if (!serial && !data.productId && !data.deviceName)
    throw new AppError("ClaimDeviceRequired", null, {
      deviceName: "ClaimDeviceRequired",
    });

  let customer = null;
  const customerId = data.customerId ?? serial?.customerId ?? null;
  if (customerId) {
    customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, arName: true, phone: true },
    });
    if (!customer) throw new AppError("CustomerNotFound");
  }
  if (!customer && !data.customerName)
    throw new AppError("ClaimCustomerRequired", null, {
      customerName: "ClaimCustomerRequired",
    });

  const ends = dateOnly(serial?.warrantyEndsAt);
  const inWarranty =
    serial?.status === "sold" && Boolean(ends) && ends >= today();
  const kind = data.kind ?? (inWarranty ? "warranty" : "paid");

  return runTx(async (tx) => {
    const { number, docCode } = await nextBranchNumber(
      tx,
      "claim",
      user.branch.id,
    );
    const claim = await tx.warrantyClaim.create({
      data: {
        number,
        docCode,
        kind,
        status: "received",
        branchId: user.branch.id,
        customerId: customer?.id ?? null,
        customerName: customer ? null : data.customerName,
        customerPhone: data.customerPhone ?? customer?.phone ?? null,
        productId: serial?.productId ?? data.productId ?? null,
        deviceName: data.deviceName ?? null,
        serialId: serial?.id ?? null,
        serialText: serial?.serial ?? data.serialText ?? null,
        serial2Text: serial?.serial2 ?? data.serial2Text ?? null,
        inWarranty,
        warrantyEndsAt: serial?.warrantyEndsAt ?? null,
        fault: data.fault,
        accessories: data.accessories ?? [],
        accessoriesOther: data.accessoriesOther ?? null,
        condition: data.condition ?? null,
        expectedAt: data.expectedAt ? dayToDbDate(data.expectedAt) : null,
        estimate: data.estimate ?? null,
        notes: data.notes ?? null,
        createdById: user.id,
        logs: { create: { status: "received", userId: user.id } },
      },
      select: { id: true, number: true, docCode: true },
    });
    return claim;
  });
}

// تعديل بيانات الطلب (قبل التسليم)
export async function updateClaim({ id, ...data }, user) {
  await assertModule("warrantyClaims");
  const c = await getOwnClaim(id, user);
  if (!OPEN.includes(c.status)) throw new AppError("ClaimClosed");
  await prisma.warrantyClaim.update({
    where: { id },
    data: {
      kind: data.kind,
      customerPhone: data.customerPhone ?? null,
      ...(c.customerId ? {} : { customerName: data.customerName ?? null }),
      fault: data.fault,
      accessories: data.accessories ?? [],
      accessoriesOther: data.accessoriesOther ?? null,
      condition: data.condition ?? null,
      expectedAt: data.expectedAt ? dayToDbDate(data.expectedAt) : null,
      estimate: data.estimate ?? null,
      notes: data.notes ?? null,
    },
  });
  return { id };
}

async function getOwnClaim(id, user, db = prisma) {
  const c = await db.warrantyClaim.findFirst({
    where: { id, ...branchScope(user) },
    select: {
      id: true,
      status: true,
      kind: true,
      customerId: true,
      serialId: true,
      productId: true,
      saleId: true,
      result: true,
      _count: { select: { items: true } },
    },
  });
  if (!c) throw new AppError("ClaimNotFound");
  return c;
}

// ------------------------------------------------------------
// تغيير المرحلة
// data: { status, note, supplierId, agentRef, result, resultNote,
//         newSerial, newSerial2 }
// ------------------------------------------------------------
export async function changeClaimStatus({ id, status, ...data }, user) {
  await assertModule("warrantyClaims");
  if (status === "delivered" && !can(user, "warrantyClaims.deliver"))
    throw new AppError("Forbidden");
  if (status === "cancelled" && !can(user, "warrantyClaims.cancel"))
    throw new AppError("Forbidden");

  return runTx(async (tx) => {
    const c = await getOwnClaim(id, user, tx);
    if (!nextStatuses(c.status).includes(status))
      throw new AppError("ClaimBadStatus");

    const patch = { status };
    const now = new Date();

    if (status === "at_agent") {
      if (data.supplierId) {
        const s = await tx.supplier.findUnique({
          where: { id: data.supplierId },
          select: { id: true },
        });
        if (!s) throw new AppError("SupplierNotFound");
      }
      patch.supplierId = data.supplierId ?? null;
      patch.agentRef = data.agentRef ?? null;
      patch.sentAt = now;
    }

    if (status === "back") {
      if (!data.result)
        throw new AppError("ClaimResultRequired", null, {
          result: "ClaimResultRequired",
        });
      patch.backAt = now;
      patch.result = data.result;
      patch.resultNote = data.resultNote ?? null;
      if (data.result === "replaced")
        patch.newSerialId = await replaceSerial(tx, c, data);
    }

    // جاهز من غير وكيل (اتصلّح في المحل)
    if (status === "ready" && !c.result) patch.result = "repaired";

    if (status === "delivered") {
      // صيانة مدفوعة عليها قطع/مصنعية: الفاتورة الأول
      if (c.kind === "paid" && c._count.items > 0 && !c.saleId)
        throw new AppError("ClaimInvoiceRequired");
      patch.deliveredAt = now;
    }

    if (status === "cancelled" && c.saleId)
      throw new AppError("ClaimHasInvoice");

    await tx.warrantyClaim.update({ where: { id }, data: patch });
    await tx.warrantyClaimLog.create({
      data: {
        claimId: id,
        status,
        note: data.note ?? data.resultNote ?? null,
        userId: user.id,
      },
    });
    return { id, status };
  });
}

// الاستبدال: القطعة القديمة "مستبدلة"، والجديدة باسم العميل بنفس الضمان
async function replaceSerial(tx, claim, data) {
  const serialText = (data.newSerial ?? "").trim();
  if (!serialText)
    throw new AppError("ClaimNewSerialRequired", null, {
      newSerial: "ClaimNewSerialRequired",
    });
  if (!claim.serialId) throw new AppError("ClaimNoSerialToReplace");
  const old = await tx.productSerial.findUnique({
    where: { id: claim.serialId },
  });
  if (!old) throw new AppError("ClaimNoSerialToReplace");

  const existing = await tx.productSerial.findUnique({
    where: {
      productId_serial: { productId: old.productId, serial: serialText },
    },
    select: { id: true, status: true },
  });
  if (existing?.status === "sold")
    throw new AppError("SerialAlreadySold", { serial: serialText });

  const sold = {
    status: "sold",
    serial2: (data.newSerial2 ?? "").trim() || null,
    saleItemId: old.saleItemId,
    customerId: old.customerId,
    soldAt: old.soldAt,
    warrantyMonths: old.warrantyMonths,
    warrantyType: old.warrantyType,
    warrantyEndsAt: old.warrantyEndsAt,
    isUsed: false,
  };
  const created = existing
    ? await tx.productSerial.update({
        where: { id: existing.id },
        data: sold,
        select: { id: true },
      })
    : await tx.productSerial.create({
        data: { ...sold, productId: old.productId, serial: serialText },
        select: { id: true },
      });
  await tx.productSerial.update({
    where: { id: old.id },
    data: { status: "replaced", saleItemId: null },
  });
  return created.id;
}

// ------------------------------------------------------------
// قطع الغيار والمصنعية (قبل الفاتورة)
// items: [{ productId, unitId, qty, price, note }]
// ------------------------------------------------------------
export async function setClaimItems({ id, items }, user) {
  await assertModule("warrantyClaims");
  const c = await getOwnClaim(id, user);
  if (!OPEN.includes(c.status)) throw new AppError("ClaimClosed");
  if (c.saleId) throw new AppError("ClaimHasInvoice");
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      baseUnitId: true,
      productUnits: { select: { unitId: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const it of items) {
    const p = byId.get(it.productId);
    if (!p) throw new AppError("ProductNotFound");
    if (
      it.unitId !== p.baseUnitId &&
      !p.productUnits.some((u) => u.unitId === it.unitId)
    )
      throw new AppError("InvalidUnit");
  }
  await prisma.$transaction([
    prisma.warrantyClaimItem.deleteMany({ where: { claimId: id } }),
    prisma.warrantyClaimItem.createMany({
      data: items.map((it) => ({
        claimId: id,
        productId: it.productId,
        unitId: it.unitId,
        qty: it.qty,
        price: it.price,
        note: it.note ?? null,
      })),
    }),
  ]);
  return { id, count: items.length };
}

// ------------------------------------------------------------
// القراءة
// ------------------------------------------------------------
const nameSelect = { select: { id: true, arName: true, enName: true } };

export async function listClaims(
  { status = "open", q = "", page = 1, pageSize = 30 },
  user,
) {
  await assertModule("warrantyClaims");
  const text = q.trim();
  // رقم الطلب: في فرع الرمز (DM-WC-5) أو فرع المستخدم
  const ref = text ? await docNumberWhere(text, user) : null;
  const where = {
    ...branchScope(user),
    ...(status === "open"
      ? { status: { in: OPEN } }
      : status === "all"
        ? {}
        : { status }),
    ...(text
      ? {
          OR: [
            ...(ref ? [ref] : []),
            { serialText: { contains: text } },
            { serial2Text: { contains: text } },
            { customerName: { contains: text } },
            { customerPhone: { contains: text } },
            { deviceName: { contains: text } },
            { customer: { arName: { contains: text } } },
            { customer: { phone: { contains: text } } },
            { product: { arName: { contains: text } } },
          ],
        }
      : {}),
  };
  const [total, rows, groups] = await Promise.all([
    prisma.warrantyClaim.count({ where }),
    prisma.warrantyClaim.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true, docCode: true,
        kind: true,
        status: true,
        result: true,
        customerName: true,
        customerPhone: true,
        deviceName: true,
        serialText: true,
        inWarranty: true,
        sentAt: true,
        createdAt: true,
        expectedAt: true,
        customer: { select: { arName: true, enName: true, phone: true } },
        product: nameSelect,
        supplier: nameSelect,
        sale: { select: { id: true, number: true, docCode: true } },
      },
    }),
    prisma.warrantyClaim.groupBy({
      by: ["status"],
      where: { ...where, status: undefined },
      _count: { _all: true },
    }),
  ]);
  // عدد الطلبات في كل مرحلة (أزرار الفلتر) - بنفس البحث ومن غير فلتر المرحلة
  const counts = Object.fromEntries(
    groups.map((g) => [g.status, g._count._all]),
  );
  counts.open = OPEN.reduce((s, k) => s + (counts[k] ?? 0), 0);
  counts.all = groups.reduce((s, g) => s + g._count._all, 0);
  return {
    total,
    counts,
    rows: rows.map((r) => ({ ...r, expectedAt: dateOnly(r.expectedAt) })),
  };
}

// عدّادات الصفحة الرئيسية: جاهز للتسليم + متأخر عند الوكيل
export const AGENT_LATE_DAYS = 14;
export async function claimCounters(user) {
  const late = new Date(Date.now() - AGENT_LATE_DAYS * 86_400_000);
  const [ready, atAgentLate, open] = await Promise.all([
    prisma.warrantyClaim.count({
      where: { ...branchScope(user), status: "ready" },
    }),
    prisma.warrantyClaim.count({
      where: { ...branchScope(user), status: "at_agent", sentAt: { lt: late } },
    }),
    prisma.warrantyClaim.count({
      where: { ...branchScope(user), status: { in: OPEN } },
    }),
  ]);
  return { ready, atAgentLate, open };
}

export async function getClaim(id, user) {
  await assertModule("warrantyClaims");
  const c = await prisma.warrantyClaim.findFirst({
    where: { id, ...branchScope(user) },
    include: {
      branch: nameSelect,
      customer: {
        select: {
          id: true,
          code: true,
          arName: true,
          enName: true,
          phone: true,
        },
      },
      product: { select: { id: true, code: true, arName: true, enName: true } },
      supplier: nameSelect,
      serial: {
        select: {
          id: true,
          serial: true,
          serial2: true,
          status: true,
          saleItem: {
            select: {
              sale: { select: { id: true, number: true, docCode: true, date: true } },
            },
          },
        },
      },
      newSerial: { select: { id: true, serial: true, serial2: true } },
      sale: { select: { id: true, number: true, docCode: true, totalAmount: true } },
      createdBy: { select: { arFullname: true, enFullname: true } },
      items: {
        orderBy: { id: "asc" },
        include: {
          product: {
            select: { id: true, code: true, arName: true, enName: true },
          },
          unit: nameSelect,
        },
      },
      logs: {
        orderBy: { id: "asc" },
        include: { user: { select: { arFullname: true, enFullname: true } } },
      },
    },
  });
  if (!c) return null;
  return {
    ...c,
    estimate: c.estimate == null ? null : n(c.estimate),
    expectedAt: dateOnly(c.expectedAt),
    warrantyEndsAt: dateOnly(c.warrantyEndsAt),
    sale: c.sale ? { ...c.sale, totalAmount: n(c.sale.totalAmount) } : null,
    items: c.items.map((i) => ({ ...i, qty: n(i.qty), price: n(i.price) })),
    next: nextStatuses(c.status),
  };
}

// ------------------------------------------------------------
// فاتورة الصيانة: الطلب بشكل "مصدر" لشاشة فاتورة البيع
// (نفس شكل عرض السعر: سطور بأصنافها وأسعارها، والعميل)
// ------------------------------------------------------------
export async function getClaimForSale(id, user) {
  const c = await getClaim(id, user);
  if (!c) return null;
  if (c.saleId) throw new AppError("ClaimHasInvoice");
  const ctx = await getBranchSaleContext(user.branch.id);
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(c.items.map((i) => i.productId))] } },
    select: saleProductSelect(ctx),
  });
  const byId = new Map(products.map((p) => [p.id, toSaleProduct(p)]));
  return {
    id: c.id,
    number: c.number,
    customerId: c.customerId,
    notes: `WC-${c.number}${c.serialText ? ` — ${c.serialText}` : ""}`,
    discountType: "amount",
    discountValue: 0,
    items: c.items.map((i) => {
      const product = byId.get(i.productId);
      return {
        productId: i.productId,
        code: i.product.code,
        arName: i.product.arName,
        enName: i.product.enName,
        unit: i.unit,
        factor: product?.units.find((u) => u.unit.id === i.unitId)?.factor ?? 1,
        qty: i.qty,
        price: i.price,
        discountType: "amount",
        discountValue: 0,
        note: i.note,
        taxRate: product?.taxRate ?? 0,
        priceIncludesTax: product?.priceIncludesTax ?? false,
        product,
      };
    }),
  };
}

// أسعار سطور الطلب (السيرفر بيقبلها في الفاتورة حتى من غير صلاحية تغيير السعر)
export async function claimPrices(claimId, user) {
  await assertModule("warrantyClaims");
  const c = await prisma.warrantyClaim.findFirst({
    where: { id: claimId, ...branchScope(user) },
    select: {
      id: true,
      saleId: true,
      status: true,
      items: { select: { productId: true, unitId: true, price: true } },
    },
  });
  if (!c) throw new AppError("ClaimNotFound");
  if (c.saleId) throw new AppError("ClaimHasInvoice");
  if (!OPEN.includes(c.status)) throw new AppError("ClaimClosed");
  return c;
}

// ربط الفاتورة بالطلب (جوه عملية حفظ الفاتورة)
export async function linkClaimSale(tx, claimId, saleId, user) {
  const { count } = await tx.warrantyClaim.updateMany({
    where: { id: claimId, saleId: null },
    data: { saleId },
  });
  if (!count) throw new AppError("ClaimHasInvoice");
  await tx.warrantyClaimLog.create({
    data: { claimId, status: "invoiced", userId: user.id },
  });
}
