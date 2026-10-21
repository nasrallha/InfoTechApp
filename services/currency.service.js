import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

// ============================================================
// العملات
// قاعدة: عملة أساسية واحدة فقط، ولازم تكون نشطة
// ============================================================

const currencySelect = {
  id: true,
  code: true,
  arName: true,
  enName: true,
  arSymbol: true,
  enSymbol: true,
  decimals: true,
  isBase: true,
  isActive: true,
};

// لو لا توجد عملة أساسية بعد (قبل تشغيل الـ migration مثلاً)
const FALLBACK_CURRENCY = {
  id: null,
  code: "SAR",
  arName: "ريال سعودي",
  enName: "Saudi Riyal",
  arSymbol: "ر.س",
  enSymbol: "SAR",
  decimals: 2,
  isBase: true,
  isActive: true,
};

// كل العملات: الأساسية أولاً
export async function getCurrencies() {
  return prisma.currency.findMany({
    orderBy: [{ isBase: "desc" }, { id: "asc" }],
    select: currencySelect,
  });
}

// العملات النشطة (لاختيار العملة الأساسية عند إعداد النظام)
export async function getActiveCurrencies() {
  return prisma.currency.findMany({
    where: { isActive: true },
    orderBy: [{ isBase: "desc" }, { id: "asc" }],
    select: currencySelect,
  });
}

// العملة الأساسية التي يعمل بها النظام كله
export async function getBaseCurrency() {
  const base = await prisma.currency.findFirst({
    where: { isBase: true },
    select: currencySelect,
  });
  return base ?? FALLBACK_CURRENCY;
}

function handleUniqueError(error) {
  if (error?.code === "P2002") {
    throw new AppError("CurrencyCodeExists", null, { code: "CurrencyCodeExists" });
  }
  throw error;
}

export async function createCurrency(data) {
  try {
    return await prisma.currency.create({ data, select: currencySelect });
  } catch (error) {
    handleUniqueError(error);
  }
}

export async function updateCurrency({ id, ...data }) {
  const current = await prisma.currency.findUnique({
    where: { id },
    select: { isBase: true },
  });
  if (!current) throw new AppError("CurrencyNotFound");

  // العملة الأساسية لا تُوقف
  if (current.isBase && !data.isActive) {
    throw new AppError("BaseCurrencyMustBeActive", null, {
      isActive: "BaseCurrencyMustBeActive",
    });
  }

  try {
    return await prisma.currency.update({
      where: { id },
      data,
      select: currencySelect,
    });
  } catch (error) {
    handleUniqueError(error);
  }
}

// تغيير العملة الأساسية (وتصبح نشطة)
// تنبيه: لاحقاً بعد وجود فواتير سنمنع تغييرها حتى لا تختلف الحسابات
export async function setBaseCurrency(id) {
  const exists = await prisma.currency.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw new AppError("CurrencyNotFound");

  await prisma.$transaction([
    prisma.currency.updateMany({ data: { isBase: false } }),
    prisma.currency.update({
      where: { id },
      data: { isBase: true, isActive: true },
    }),
  ]);
}

export async function deleteCurrencies(ids) {
  const base = await prisma.currency.count({
    where: { id: { in: ids }, isBase: true },
  });
  if (base) throw new AppError("CannotDeleteBaseCurrency");

  const { count } = await prisma.currency.deleteMany({
    where: { id: { in: ids } },
  });
  return { deleted: count };
}
