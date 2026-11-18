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
    construction,
    rentContracts,
    tailorOrders,
    laundry,
    users,
    branches,
    warehouses,
    restaurantOrders,
    bookings,
    maintenanceContracts,
    warrantyClaims,
    followUps,
  ] = await Promise.all([
    prisma.sale.count({ where: { type: "sale" } }),
    prisma.sale.count({ where: { type: { in: ["return", "credit", "debit"] } } }),
    prisma.zatcaDocument.count({ where: { sale: { type: "sale" } } }),
    prisma.zatcaDocument.count({ where: { sale: { type: { in: ["return", "credit", "debit"] } } } }),
    prisma.quotation.count(),
    prisma.purchase.count({ where: { type: "purchase" } }),
    prisma.purchase.count({ where: { type: { in: ["return", "credit", "debit"] } } }),
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
    // مستندات الأنشطة
    Promise.all([
      prisma.constructionContract.count({ where: { isDirect: false } }),
      prisma.constructionCertificate.count(),
    ]).then(([a, b]) => a + b),
    prisma.rentContract.count(),
    prisma.tailorOrder.count(),
    Promise.all([prisma.laundryOrder.count(), prisma.laundryWallet.count()]).then(([a, b]) => a + b),
    // المستخدمين والفروع والمستودعات (من غير مدير النظام والرئيسي)
    prisma.user.count({ where: { isOwner: false, role: { isSuper: false } } }),
    prisma.branch.count().then((c) => Math.max(0, c - 1)),
    prisma.warehouse.count({ where: { isMain: false } }),
    prisma.restaurantOrder.count(),
    prisma.booking.count(),
    prisma.maintenanceContract.count(),
    prisma.warrantyClaim.count(),
    prisma.followUp.count(),
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
      construction,
      rentContracts,
      tailorOrders,
      laundry,
      users,
      branches,
      warehouses,
      restaurantOrders,
      bookings,
      maintenanceContracts,
      warrantyClaims,
      followUps,
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

// مسح صفوف (users / branches / warehouses) من غير ما قاعدة البيانات ترفض:
// كل جدول مربوط بيها برابط RESTRICT ← الصفوف المربوطة بتتنقل للبديل (مدير النظام / الفرع الرئيسي)
// (اللي بيتعارض مع قيد فريد بعد النقل بيتمسح)، والروابط CASCADE / SET NULL بتتعمل لوحدها
const SAFE_NAME = /^\w+$/;
async function reassignAndDelete(tx, table, removeIds, targetId) {
  if (!removeIds.length) return 0;
  const fks = await tx.$queryRaw`
    SELECT k.TABLE_NAME AS t, k.COLUMN_NAME AS c, r.DELETE_RULE AS d
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
    WHERE k.REFERENCED_TABLE_SCHEMA = DATABASE()
      AND k.REFERENCED_TABLE_NAME = ${table}
      AND k.REFERENCED_COLUMN_NAME = 'id'`;
  const list = removeIds.map(Number).join(",");
  for (const fk of fks) {
    if (!["RESTRICT", "NO ACTION"].includes(String(fk.d).toUpperCase())) continue;
    if (!SAFE_NAME.test(fk.t) || !SAFE_NAME.test(fk.c)) continue;
    if (targetId) {
      await tx.$executeRawUnsafe(
        `UPDATE IGNORE \`${fk.t}\` SET \`${fk.c}\` = ${Number(targetId)} WHERE \`${fk.c}\` IN (${list})`,
      );
    }
    await tx.$executeRawUnsafe(`DELETE FROM \`${fk.t}\` WHERE \`${fk.c}\` IN (${list})`);
  }
  return tx.$executeRawUnsafe(`DELETE FROM \`${table}\` WHERE id IN (${list})`);
}

// اللي مايتمسحش: مدير النظام (والمالك) والفرع الرئيسي (أول فرع) والمستودع الرئيسي
async function keepers(db) {
  const [admins, mainBranch, mainWarehouse] = await Promise.all([
    db.user.findMany({
      where: { OR: [{ isOwner: true }, { role: { isSuper: true } }] },
      orderBy: { id: "asc" },
      select: { id: true, isOwner: true },
    }),
    db.branch.findFirst({ orderBy: { id: "asc" }, select: { id: true } }),
    db.warehouse.findFirst({ where: { isMain: true }, orderBy: { id: "asc" }, select: { id: true } }),
  ]);
  return {
    adminIds: admins.map((u) => u.id),
    // مستندات المستخدمين الممسوحين بتتنقل لمدير النظام (أو المالك لو مفيش)
    adminId: (admins.find((u) => !u.isOwner) ?? admins[0])?.id ?? null,
    mainBranchId: mainBranch?.id ?? null,
    mainWarehouseId: mainWarehouse?.id ?? null,
  };
}

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
        await tx.drawerJoin.deleteMany({});
        await tx.shift.deleteMany({});
        await tx.branchShift.deleteMany({});
      }

      // ---------- مستندات الأنشطة (قبل الفواتير والعملاء والموردين) ----------
      // المغسلة: الاستخدامات مربوطة بفواتير البيع، والطلبات والاشتراكات بالعملاء
      if (has("laundry") || has("saleReturns")) await tx.laundryWalletUse.deleteMany({});
      if (has("laundry")) {
        await tx.laundryOrder.deleteMany({}); // القطع Cascade
        await tx.laundryWallet.deleteMany({});
      }
      // المقاولات: الدفعات ثم المستخلصات (البنود Cascade) ثم العقود (المقايسة وأوامر التغيير Cascade)
      if (has("construction")) {
        await tx.constructionPayment.deleteMany({});
        await tx.constructionCertificate.deleteMany({});
        await tx.constructionContract.updateMany({ data: { parentId: null } });
        await tx.constructionContract.deleteMany({});
      }
      // الإيجار (الوحدات والدفعات Cascade) والتفصيل (السطور Cascade)
      if (has("rentContracts")) {
        await tx.rentContract.updateMany({ data: { renewedFromId: null } });
        await tx.rentContract.deleteMany({});
      }
      if (has("tailorOrders")) await tx.tailorOrder.deleteMany({});

      // ---------- 3) مرتجعات المبيعات ----------
      if (has("saleReturns")) {
        // المرتجعات + الإشعارات الدائنة والمدينة
        const ret = await ids(tx.sale, { type: { in: ["return", "credit", "debit"] } });
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
        // المرتجعات + إشعارات الموردين
        const ret = await ids(tx.purchase, { type: { in: ["return", "credit", "debit"] } });
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

      // طلبات الضمان والصيانة: مربوطة بالعملاء والأصناف والموردين والفواتير (القطع والسجل Cascade)
      if (has("warrantyClaims")) await tx.warrantyClaim.deleteMany({});
      // عقود الصيانة الدورية: مربوطة بالعملاء (الزيارات Cascade)
      if (has("maintenanceContracts")) await tx.maintenanceContract.deleteMany({});
      // المتابعات الدورية: مربوطة بالعملاء وفواتير البيع (السجل Cascade)
      if (has("followUps")) await tx.followUp.deleteMany({});
      // الحجوزات: مربوطة بالعملاء والخدمات والفواتير (الخدمات Cascade)
      if (has("bookings")) await tx.booking.deleteMany({});
      // طلبات المطعم (الأصناف Cascade)
      if (has("restaurantOrders")) await tx.restaurantOrder.deleteMany({});


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

      // ---------- المستخدمين والفروع والمستودعات (ما عدا مدير النظام والرئيسي) ----------
      if (has("users") || has("branches") || has("warehouses")) {
        const k = await keepers(tx);
        // مفيش مدير نظام ولا مالك ← المستخدمين مايتمسحوش (عشان الدخول بعد التصفير)
        if (has("users") && k.adminId) {
          const remove = await ids(tx.user, { id: { notIn: k.adminIds } });
          await reassignAndDelete(tx, "users", remove, k.adminId);
        }
        if (has("branches") && k.mainBranchId) {
          const remove = await ids(tx.branch, { id: { not: k.mainBranchId } });
          await reassignAndDelete(tx, "branches", remove, k.mainBranchId);
        }
        if (has("warehouses") && k.mainWarehouseId) {
          const remove = await ids(tx.warehouse, { id: { not: k.mainWarehouseId } });
          // الفروع اللي مستودعها اتمسح ← على المستودع الرئيسي
          await tx.branch.updateMany({ where: { warehouseId: { in: remove } }, data: { warehouseId: k.mainWarehouseId } });
          await reassignAndDelete(tx, "warehouses", remove, k.mainWarehouseId);
        }
      }

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
          // المسلسل القديم (للشركة) + مسلسلات الفروع ("النوع@الفرع")
          await tx.documentSequence.deleteMany({
            where: {
              OR: [
                { key: { in: keysToReset } },
                ...keysToReset.map((k) => ({ key: { startsWith: `${k}@` } })),
              ],
            },
          });
        }
      }

      // ---------- 11) رمز الفرع: يتفتح تاني لو الفرع مبقاش عليه ولا مستند مترقّم ----------
      await tx.$executeRaw`
        UPDATE branches b SET codeLocked = false
        WHERE codeLocked = true
          AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.branchId = b.id)
          AND NOT EXISTS (SELECT 1 FROM purchases p WHERE p.branchId = b.id)
          AND NOT EXISTS (SELECT 1 FROM vouchers v WHERE v.branchId = b.id)
          AND NOT EXISTS (SELECT 1 FROM quotations q WHERE q.branchId = b.id)
          AND NOT EXISTS (SELECT 1 FROM stock_transfers x WHERE x.branchId = b.id)
          AND NOT EXISTS (SELECT 1 FROM stock_adjustments x WHERE x.branchId = b.id)
          AND NOT EXISTS (SELECT 1 FROM inventory_counts x WHERE x.branchId = b.id)
          AND NOT EXISTS (SELECT 1 FROM shifts x WHERE x.branchId = b.id)
          AND NOT EXISTS (SELECT 1 FROM bookings x WHERE x.branchId = b.id)
          AND NOT EXISTS (SELECT 1 FROM warranty_claims x WHERE x.branchId = b.id)
          AND NOT EXISTS (SELECT 1 FROM maintenance_contracts x WHERE x.branchId = b.id)
          AND NOT EXISTS (SELECT 1 FROM laundry_wallets x WHERE x.branchId = b.id)`;
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
