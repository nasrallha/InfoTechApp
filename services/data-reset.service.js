import "server-only";
import { IN_STOCK, SOLD, warrantyEnd } from "./serial.service";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { RESET_ITEMS, RESET_KEYS, expandSelection } from "@/lib/data-reset";
import { SENT_PRODUCTION } from "./zatca-invoice.service";

// ============================================================
// التصفير (الإدارة ← تصفير البيانات) - بصلاحية dataReset.run
// - المستخدم بيختار اللي يتمسح (علامة صح قدام كل نوع، أو الكل)
// - اللي مربوط بيه بيتمسح معاه تلقائياً (expandSelection) عشان قاعدة البيانات
//   متتلخبطش: مثلاً الأصناف ← الفواتير والتحويلات والجرد قبلها
// - برا التصفير خالص (مش موجودين هنا أصلاً): بيانات الشركة والإعدادات كلها،
//   الطباعة، العملات وطرق الدفع، الربط مع الزكاة (الشهادات والسلسلة)،
//   الدخول والأمان (الإعدادات والسجل والجلسات)، المستخدمين والأدوار، الفروع والمستودعات
// - أرصدة المخزون بتتحسب من جديد من الحركات اللي فضلت
// - resetNumbers: الترقيم يرجع من 1 للأنواع اللي اتمسحت كلها بس
//   (لو فاضل مستندات من نفس النوع، الترقيم بيكمل عشان ميتكررش)
// - ممنوع مسح فواتير اتبعتت على بيئة الإنتاج (سجلات رسمية عند الهيئة)
// ============================================================

const notZero = { not: 0 };

// عدد كل نوع (للعرض) + الممنوع
export async function getResetCounts() {
  const production = await productionState();
  const [
    sales,
    saleReturns,
    salesZatca,
    returnsZatca,
    quotations,
    purchases,
    purchaseReturns,
    vouchers,
    shifts,
    transfers,
    counts,
    openingStock,
    products,
    categories,
    units,
    priceLists,
    promotions,
    customers,
    suppliers,
    custOpening,
    suppOpening,
    expenseCategories,
  ] = await Promise.all([
    prisma.sale.count({ where: { type: "sale" } }),
    prisma.sale.count({ where: { type: "return" } }),
    prisma.zatcaDocument.count({ where: { sale: { type: "sale" } } }),
    prisma.zatcaDocument.count({ where: { sale: { type: "return" } } }),
    prisma.quotation.count(),
    prisma.purchase.count({ where: { type: "purchase" } }),
    prisma.purchase.count({ where: { type: "return" } }),
    prisma.voucher.count(),
    prisma.shift.count(),
    prisma.stockTransfer.count(),
    prisma.inventoryCount
      .count()
      .then(async (c) => c + (await prisma.stockAdjustment.count())),
    prisma.stockMovement.count({ where: { type: "opening" } }),
    prisma.product.count(),
    prisma.category.count(),
    prisma.unit.count(),
    prisma.priceList.count(),
    prisma.promotion.count(),
    prisma.customer.count(),
    prisma.supplier.count(),
    prisma.customer.count({ where: { openingBalance: notZero } }),
    prisma.supplier.count({ where: { openingBalance: notZero } }),
    prisma.expenseCategory.count(),
  ]);

  return {
    counts: {
      sales,
      saleReturns,
      quotations,
      purchases,
      purchaseReturns,
      vouchers,
      shifts,
      transfers,
      counts,
      openingStock,
      products,
      categories,
      units,
      priceLists,
      promotions,
      customers,
      suppliers,
      openingBalances: custOpening + suppOpening,
      expenseCategories,
    },
    // الفواتير الإلكترونية اللي هتتمسح مع البيع / المرتجع
    zatca: { sales: salesZatca, saleReturns: returnsZatca },
    // البرنامج شغال على الإنتاج: كل المبيعات والمرتجعات مقفولة
    // (والعناصر اللي بتحتاجهم زي الأصناف والعملاء مقفولة كمان)
    production: { sent: production.sent, unsent: production.unsent },
    blocked: {
      sales: production.live,
      saleReturns: production.live,
    },
  };
}

// ------------------------------------------------------------
// المبيعات بتتقفل من التصفير بس لما فاتورة واحدة على الأقل تكون
// **اتبعتت فعلاً للزكاة على بيئة الإنتاج**: الهيئة ردّت عليها
// (اتقبلت / اتعمدت / اترفضت، أو رجع منها أي رد)
// - قبل كده (فواتير اتعملت على الإنتاج ولسه ماتبعتتش): التصفير مسموح،
//   والسلسلة (ICV / الـ Hash) بترجع لآخر فاتورة فاضلة عشان أول فاتورة حقيقية تبدأ صح
// - المحاكاة وبوابة المطورين: مش بتقفل حاجة أبداً
// ------------------------------------------------------------
const SENT = SENT_PRODUCTION;

async function productionState() {
  const [sent, unsent] = await Promise.all([
    prisma.zatcaDocument.count({ where: SENT }),
    prisma.zatcaDocument.count({
      where: { environment: "production", NOT: SENT },
    }),
  ]);
  return { live: sent > 0, sent, unsent };
}

// بعد مسح فواتير إنتاج ماتبعتتش: وحدة الربط ترجع لآخر فاتورة فاضلة
// (ولو مفيش: ICV = 0 والـ Hash الابتدائي، كأنها لسه متسجلة)
async function rewindProductionChains(tx) {
  const units = await tx.zatcaUnit.findMany({
    where: { environment: "production" },
    select: { id: true },
  });
  for (const u of units) {
    const last = await tx.zatcaDocument.findFirst({
      where: { unitId: u.id },
      orderBy: { icv: "desc" },
      select: { icv: true, hash: true },
    });
    await tx.zatcaUnit.update({
      where: { id: u.id },
      data: { icv: last?.icv ?? 0, lastHash: last?.hash ?? null },
    });
  }
}

const ids = async (model, where) =>
  (await model.findMany({ where, select: { id: true } })).map((r) => r.id);

export async function resetData({ keys, resetNumbers }, user) {
  const selected = expandSelection(keys.filter((k) => RESET_KEYS.includes(k)));
  if (!selected.size) throw new AppError("ResetNothingSelected");
  const has = (k) => selected.has(k);

  const before = await getResetCounts();
  if ([...selected].some((k) => before.blocked[k])) {
    throw new AppError("ResetBlockedProduction");
  }

  await prisma.$transaction(
    async (tx) => {
      // تأكيد تاني جوه العملية: ممكن فاتورة تكون اتبعتت من الطابور في الخلفية من شوية
      if (
        (has("sales") || has("saleReturns")) &&
        (await tx.zatcaDocument.count({ where: SENT })) > 0
      ) {
        throw new AppError("ResetBlockedProduction");
      }
      const stockTouched = [
        "sales",
        "saleReturns",
        "purchases",
        "purchaseReturns",
        "transfers",
        "counts",
        "openingStock",
        "products",
      ].some(has);

      // ---------- 1) السندات ----------
      if (has("vouchers")) {
        await tx.voucherAllocation.deleteMany({});
        await tx.voucher.deleteMany({});
        // الفواتير اللي فاضلة: مفيش سداد عليها بسندات
        await tx.sale.updateMany({ data: { settledAmount: 0 } });
        await tx.purchase.updateMany({ data: { settledAmount: 0 } });
      }

      // ---------- 2) الورديات: المستندات اللي فاضلة بتنفك منها ----------
      if (has("shifts")) {
        await tx.cashMovement.deleteMany({});
        await tx.sale.updateMany({
          where: { shiftId: { not: null } },
          data: { shiftId: null },
        });
        await tx.voucher.updateMany({
          where: { shiftId: { not: null } },
          data: { shiftId: null },
        });
        await tx.shift.deleteMany({});
      }

      // ---------- 3) مرتجعات المبيعات ----------
      if (has("saleReturns")) {
        const ret = await ids(tx.sale, { type: "return" });
        if (ret.length) {
          await tx.voucherAllocation.deleteMany({
            where: { saleId: { in: ret } },
          });
          await tx.zatcaDocument.deleteMany({ where: { saleId: { in: ret } } });
          await tx.stockMovement.deleteMany({
            where: { refType: "sale", refId: { in: ret } },
          });
          await tx.sale.deleteMany({ where: { id: { in: ret } } }); // البنود والمدفوعات Cascade
        }
        // الفواتير الأصلية: مفيش مرتجع منها
        await tx.saleItem.updateMany({
          where: { returnedQty: { not: 0 } },
          data: { returnedQty: 0 },
        });
        // الأرقام التسلسلية اللي رجعت بالمرتجعات: ترجع مباعة بفاتورتها
        await resoldSerialsAfterReturnsReset(tx);
      }

      // ---------- 4) فواتير البيع (المرتجعات اتمسحت قبلها) ----------
      if (has("sales")) {
        const sale = await ids(tx.sale, { type: "sale" });
        if (sale.length) {
          await tx.voucherAllocation.deleteMany({
            where: { saleId: { in: sale } },
          });
          await tx.zatcaDocument.deleteMany({
            where: { saleId: { in: sale } },
          });
          await tx.stockMovement.deleteMany({
            where: { refType: "sale", refId: { in: sale } },
          });
          // عروض الأسعار اللي اتحولت لفواتير: ترجع مفتوحة
          await tx.quotation.updateMany({
            where: { saleId: { in: sale } },
            data: { status: "open", saleId: null },
          });
          await tx.sale.deleteMany({ where: { id: { in: sale } } });
        }
        // الأرقام التسلسلية مالهاش معنى من غير فواتيرها
        await tx.productSerial.deleteMany({});
      }

      // فواتير إنتاج اتمسحت قبل ما تتبعت: السلسلة ترجع لآخر فاتورة فاضلة
      if (has("sales") || has("saleReturns")) await rewindProductionChains(tx);

      // ---------- 5) عروض الأسعار ----------
      if (has("quotations")) await tx.quotation.deleteMany({});

      // ---------- 6) مرتجعات المشتريات ثم فواتير الشراء ----------
      if (has("purchaseReturns")) {
        // القطع اللي رجعت للمورد ترجع "في المحل"
        await tx.productSerial.updateMany({
          where: { status: "returned" },
          data: { status: IN_STOCK, purchaseReturnItemId: null },
        });
        const ret = await ids(tx.purchase, { type: "return" });
        if (ret.length) {
          await tx.voucherAllocation.deleteMany({
            where: { purchaseId: { in: ret } },
          });
          await tx.stockMovement.deleteMany({
            where: { refType: "purchase", refId: { in: ret } },
          });
          await tx.purchase.deleteMany({ where: { id: { in: ret } } });
        }
        await tx.purchaseItem.updateMany({
          where: { returnedQty: { not: 0 } },
          data: { returnedQty: 0 },
        });
      }
      if (has("purchases")) {
        // الأرقام المسجلة مع الشراء ومالهاش أي حركة بيع
        await tx.productSerial.deleteMany({
          where: { purchaseItemId: { not: null }, links: { none: {} } },
        });
        const pur = await ids(tx.purchase, { type: "purchase" });
        if (pur.length) {
          await tx.voucherAllocation.deleteMany({
            where: { purchaseId: { in: pur } },
          });
          await tx.stockMovement.deleteMany({
            where: { refType: "purchase", refId: { in: pur } },
          });
          await tx.purchase.deleteMany({ where: { id: { in: pur } } });
        }
      }

      // ---------- 7) المخزون ----------
      if (has("transfers")) {
        await tx.stockMovement.deleteMany({ where: { refType: "transfer" } });
        await tx.stockTransfer.deleteMany({}); // البنود Cascade
      }
      if (has("counts")) {
        await tx.stockMovement.deleteMany({ where: { refType: "count" } });
        await tx.inventoryCount.deleteMany({});
        // التوالف والزيادات (البنود Cascade)
        // القطع التالفة ترجع للمحل، واللي اتسجلت بزيادة بس تتمسح
        await tx.productSerial.updateMany({
          where: { status: "damaged", damageItemId: { not: null } },
          data: { status: "in_stock", damageItemId: null },
        });
        await tx.productSerial.deleteMany({
          where: {
            surplusItemId: { not: null },
            purchaseItemId: null,
            status: "in_stock",
            links: { none: {} },
          },
        });
        await tx.stockMovement.deleteMany({
          where: { refType: "adjustment" },
        });
        await tx.stockAdjustment.deleteMany({});
      }
      if (has("openingStock")) {
        await tx.stockMovement.deleteMany({ where: { type: "opening" } });
        await tx.product.updateMany({ data: { startStock: 0 } });
        await tx.productUnit.updateMany({ data: { startStock: 0 } });
        // الرصيد الافتتاحي في مستودعات الفروع (الإتاحة بتفضل)
        await tx.productWarehouse.updateMany({ data: { openingQty: 0 } });
      }

      // طلبات الضمان والصيانة: مربوطة بالعملاء والأصناف والموردين والفواتير
      if (
        has("sales") ||
        has("customers") ||
        has("products") ||
        has("suppliers")
      )
        await tx.warrantyClaim.deleteMany({}); // القطع والسجل Cascade
      // عقود الصيانة الدورية: مربوطة بالعملاء (الزيارات Cascade)
      if (has("sales") || has("customers"))
        await tx.maintenanceContract.deleteMany({});
      // المتابعات الدورية: مربوطة بالعملاء وفواتير البيع (السجل Cascade)
      if (has("sales") || has("customers")) await tx.followUp.deleteMany({});
      // الحجوزات: مربوطة بالعملاء والخدمات والفواتير (الخدمات Cascade)
      if (has("sales") || has("customers") || has("products"))
        await tx.booking.deleteMany({});

      // ---------- 8) البيانات الأساسية ----------
      if (has("promotions")) await tx.promotion.deleteMany({}); // الروابط Cascade، الفواتير SetNull
      if (has("priceLists")) await tx.priceList.deleteMany({}); // الأسعار Cascade، الفروع SetNull
      if (has("products")) {
        await tx.productSerial.deleteMany({});
        await tx.product.deleteMany({}); // الوحدات والأرصدة والحركات Cascade
      }
      if (has("categories")) {
        await tx.category.deleteMany({ where: { parentId: { not: null } } });
        await tx.category.deleteMany({});
      }
      if (has("units")) await tx.unit.deleteMany({});
      if (has("customers")) await tx.customer.deleteMany({});
      if (has("suppliers")) await tx.supplier.deleteMany({});
      if (has("openingBalances")) {
        await tx.customer.updateMany({
          where: { openingBalance: notZero },
          data: { openingBalance: 0 },
        });
        await tx.supplier.updateMany({
          where: { openingBalance: notZero },
          data: { openingBalance: 0 },
        });
      }
      if (has("expenseCategories")) await tx.expenseCategory.deleteMany({});

      // ---------- 9) الأرصدة من جديد = مجموع الحركات اللي فضلت ----------
      if (stockTouched) {
        await tx.stockBalance.deleteMany({});
        await tx.$executeRaw`
          INSERT INTO stock_balances (productId, warehouseId, qty, updatedAt)
          SELECT productId, warehouseId, SUM(qty), NOW(3)
          FROM stock_movements
          GROUP BY productId, warehouseId`;
      }

      // ---------- 10) الترقيم: للأنواع اللي اتمسحت كلها بس ----------
      if (resetNumbers) {
        const keysToReset = RESET_ITEMS.filter((i) => has(i.key)).flatMap(
          (i) => i.sequences,
        );
        if (keysToReset.length) {
          await tx.documentSequence.deleteMany({
            where: { key: { in: keysToReset } },
          });
        }
      }
    },
    { maxWait: 15000, timeout: 300000 },
  );

  console.info(
    `[data-reset] by user #${user?.id}: ${[...selected].join(", ")} (resetNumbers=${!!resetNumbers})`,
  );

  return { deleted: [...selected], before: before.counts };
}

// بعد مسح مرتجعات المبيعات: القطع اللي كانت راجعة "في المحل" وآخر حركة ليها
// بقت فاتورة بيع ← ترجع مباعة بالسطر ده
async function resoldSerialsAfterReturnsReset(tx) {
  const rows = await tx.productSerial.findMany({
    where: { status: IN_STOCK },
    select: {
      id: true,
      links: {
        orderBy: { id: "desc" },
        take: 1,
        select: {
          saleItem: {
            select: {
              id: true,
              warrantyMonths: true,
              warrantyType: true,
              sale: { select: { type: true, customerId: true, date: true } },
            },
          },
        },
      },
    },
  });
  for (const r of rows) {
    const it = r.links[0]?.saleItem;
    if (!it || it.sale.type !== "sale") continue;
    await tx.productSerial.update({
      where: { id: r.id },
      data: {
        status: SOLD,
        saleItemId: it.id,
        customerId: it.sale.customerId ?? null,
        soldAt: it.sale.date,
        warrantyMonths: it.warrantyMonths ?? null,
        warrantyType: it.warrantyType ?? null,
        warrantyEndsAt: warrantyEnd(it.sale.date, it.warrantyMonths ?? 0),
      },
    });
  }
}
