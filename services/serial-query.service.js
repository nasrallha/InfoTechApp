import "server-only";
import { partyBranchWhere } from "@/lib/party-scope";
import { prisma } from "@/lib/prisma";
import { dayEnd, dayStart, dayToDbDate, today } from "@/lib/dates";
import { assertModule } from "@/lib/modules";

// ============================================================
// البحث بالرقم التسلسلي وتقرير الضمانات (وحدة serials)
// ============================================================

// الضمان "قرّب يخلص": خلال كام يوم
export const EXPIRING_DAYS = 30;

const nameSelect = { select: { arName: true, enName: true } };

// ------------------------------------------------------------
// بحث بالرقم (الأول أو التاني): المطابق تمامًا الأول، وبعده اللي فيه النص
// ------------------------------------------------------------
export async function searchSerials(q) {
  await assertModule("serials");
  const text = q.trim();
  if (text.length < 2) return [];
  const rows = await prisma.productSerial.findMany({
    where: {
      OR: [{ serial: { contains: text } }, { serial2: { contains: text } }],
    },
    orderBy: { id: "desc" },
    take: 50,
    select: {
      id: true,
      serial: true,
      serial2: true,
      status: true,
      isUsed: true,
      soldAt: true,
      warrantyEndsAt: true,
      product: { select: { code: true, arName: true, enName: true } },
      customer: nameSelect,
    },
  });
  const exact = (r) =>
    r.serial.toLowerCase() === text.toLowerCase() ||
    (r.serial2 ?? "").toLowerCase() === text.toLowerCase();
  return [...rows.filter(exact), ...rows.filter((r) => !exact(r))].map(toRow);
}

const toRow = (r) => ({
  ...r,
  warrantyEndsAt: r.warrantyEndsAt
    ? r.warrantyEndsAt.toISOString().slice(0, 10)
    : null,
});

// ------------------------------------------------------------
// كارت القطعة: الصنف، الشراء، البيع الحالي، الضمان، وكل حركاتها
// ------------------------------------------------------------
const docSelect = {
  id: true,
  type: true,
  number: true, docCode: true,
  date: true,
  customerArName: true,
  customerEnName: true,
};

export async function getSerialCard(id) {
  await assertModule("serials");
  const s = await prisma.productSerial.findUnique({
    where: { id },
    select: {
      id: true,
      serial: true,
      serial2: true,
      status: true,
      isUsed: true,
      soldAt: true,
      warrantyMonths: true,
      warrantyType: true,
      warrantyEndsAt: true,
      createdAt: true,
      product: {
        select: {
          id: true,
          code: true,
          arName: true,
          enName: true,
          serialLabel1: true,
          serialLabel2: true,
        },
      },
      customer: {
        select: {
          id: true,
          code: true,
          arName: true,
          enName: true,
          phone: true,
        },
      },
      purchaseItem: {
        select: {
          purchase: {
            select: {
              id: true,
              number: true, docCode: true,
              date: true,
              supplierInvoiceNo: true,
              supplierArName: true,
              supplierEnName: true,
            },
          },
        },
      },
      purchaseReturnItem: {
        select: {
          purchase: { select: { id: true, number: true, docCode: true, date: true } },
        },
      },
      // التوالف والزيادات
      damageItem: {
        select: {
          reason: true,
          adjustment: { select: { id: true, number: true, docCode: true, date: true } },
        },
      },
      surplusItem: {
        select: {
          adjustment: { select: { id: true, number: true, docCode: true, date: true } },
        },
      },
      saleItem: {
        select: {
          sale: {
            select: {
              ...docSelect,
              branch: nameSelect,
              createdBy: { select: { arFullname: true, enFullname: true } },
            },
          },
        },
      },
      links: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          saleItem: { select: { sale: { select: docSelect } } },
        },
      },
    },
  });
  if (!s) return null;
  return {
    ...toRow(s),
    purchase: s.purchaseItem?.purchase ?? null,
    purchaseReturn: s.purchaseReturnItem?.purchase ?? null,
    damage: s.damageItem
      ? { ...s.damageItem.adjustment, reason: s.damageItem.reason }
      : null,
    surplus: s.surplusItem?.adjustment ?? null,
    damageItem: undefined,
    surplusItem: undefined,
    sale: s.saleItem?.sale ?? null,
    history: s.links.map((l) => ({ id: l.id, ...l.saleItem.sale })),
    purchaseItem: undefined,
    purchaseReturnItem: undefined,
    saleItem: undefined,
    links: undefined,
  };
}

// ------------------------------------------------------------
// تقرير الضمانات: القطع المباعة بضمان
// status: active ساري | expiring قرّب يخلص | expired منتهي | all الكل
// ------------------------------------------------------------
export async function warrantyReport({
  status = "active",
  q = "",
  customerId,
  from,
  to,
  page = 1,
  pageSize = 50,
  all = false,
}) {
  await assertModule("serials");
  const now = dayToDbDate(today());
  const soon = new Date(now.getTime() + EXPIRING_DAYS * 86_400_000);
  const ends =
    status === "active"
      ? { gte: now }
      : status === "expiring"
        ? { gte: now, lte: soon }
        : status === "expired"
          ? { lt: now }
          : { not: null };
  const text = q.trim();
  const where = {
    status: "sold",
    warrantyEndsAt: ends,
    ...(customerId ? { customerId } : {}),
    ...(from || to
      ? {
          soldAt: {
            ...(from ? { gte: dayStart(from) } : {}),
            ...(to ? { lte: dayEnd(to) } : {}),
          },
        }
      : {}),
    ...(text
      ? {
          OR: [
            { serial: { contains: text } },
            { serial2: { contains: text } },
            { product: { code: { contains: text } } },
            { product: { arName: { contains: text } } },
            { product: { enName: { contains: text } } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.productSerial.count({ where }),
    prisma.productSerial.findMany({
      where,
      orderBy: [{ warrantyEndsAt: "asc" }, { id: "asc" }],
      ...(all
        ? { take: 10_000 }
        : { skip: (page - 1) * pageSize, take: pageSize }),
      select: {
        id: true,
        serial: true,
        serial2: true,
        isUsed: true,
        soldAt: true,
        warrantyMonths: true,
        warrantyType: true,
        warrantyEndsAt: true,
        product: { select: { code: true, arName: true, enName: true } },
        customer: {
          select: { id: true, arName: true, enName: true, phone: true },
        },
        saleItem: {
          select: { sale: { select: { id: true, number: true, docCode: true } } },
        },
      },
    }),
  ]);
  return {
    total,
    rows: rows.map((r) => ({
      ...toRow(r),
      sale: r.saleItem?.sale ?? null,
      saleItem: undefined,
    })),
  };
}

// العملاء اللي عندهم أجهزة (فلتر التقرير)
export async function warrantyCustomers(user) {
  await assertModule("serials");
  return prisma.customer.findMany({
    where: {
      serials: { some: { status: "sold" } },
      ...partyBranchWhere(user),
    },
    orderBy: { arName: "asc" },
    select: { id: true, code: true, arName: true, enName: true, phone: true },
  });
}
