"use client";
import React, { useEffect, useState } from "react";
import {
  MenuFoldOutlined,
  HourglassOutlined,
  MenuUnfoldOutlined,
  HomeFilled,
  TeamOutlined,
  UsergroupAddOutlined,
  SettingOutlined,
  ShopOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  ApartmentOutlined,
  BankOutlined,
  PrinterOutlined,
  BarcodeOutlined,
  FileTextOutlined,
  FileDoneOutlined,
  DollarOutlined,
  CreditCardOutlined,
  ControlOutlined,
  InboxOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  SwapOutlined,
  DiffOutlined,
  AuditOutlined,
  RiseOutlined,
  TagsOutlined,
  DesktopOutlined,
  FieldTimeOutlined,
  WalletOutlined,
  GiftOutlined,
  PieChartOutlined,
  CalendarOutlined,
  CarOutlined,
  CloudSyncOutlined,
  FileProtectOutlined,
  CloudServerOutlined,
  ClearOutlined,
  LockOutlined,
  CrownOutlined,
  CustomerServiceOutlined,
  NumberOutlined,
  ToolOutlined,
  ScheduleOutlined,
  FileSyncOutlined,
  IdcardOutlined,
  SyncOutlined,
  AppstoreOutlined,
  ColumnWidthOutlined,
  ShoppingOutlined,
  SkinOutlined,
  CoffeeOutlined,
  ShoppingCartOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import { Button, Grid, Layout, Menu, theme } from "antd";
import { useLocale, useTranslations } from "next-intl";
import UserAvatar from "./UserAvatar";
import BranchSwitcher from "./BranchSwitcher";
import { BranchListContext } from "./BranchList";
import HeaderMenu from "./HeaderMenu";
import NotificationBell from "./NotificationBell";
import InvoiceTypePicker, {
  useVisibleInvoiceTypes,
} from "@/components/invoices/InvoiceTypePicker";
import AccountsPicker, {
  useVisibleAccountPages,
} from "@/components/accounts/AccountsPicker";
import LaundryPicker, {
  useVisibleLaundryPages,
} from "@/components/laundry/LaundryPicker";
import ReportsPicker, {
  useVisibleReports,
} from "@/components/reports/ReportsPicker";
import LanguageSwitcher from "./LanguageSwitcher";
import { useStaffWords } from "@/components/technicians/useStaffT";
import { useCompany } from "@/components/common/CompanyProvider";
import { imageUrl } from "@/lib/image";
import PoweredBy from "@/components/support/PoweredBy";
import SubscriptionBanner from "@/components/support/SubscriptionBanner";
import { Link, usePathname } from "@/i18n/routing";
import {
  useCan,
  useCurrentUser,
  useModule,
} from "@/components/auth/AuthProvider";

import "./MainLayout.css";

const { Header, Sider, Content } = Layout;

// branches: الفروع التي يقدر يتنقل بينها (لمدير النظام فقط، غيره قائمة فارغة)
// vendor: بيانات الشركة المالكة (تنفيذ: ...) | subscription: حالة الاشتراك للتنبيه
const MainLayout = ({
  children,
  branches = [],
  vendor = null,
  subscription = null,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  // الموبايل والتابلت الصغير (أقل من 992px): القائمة تطلع فوق الصفحة وتتقفل لوحدها
  const screens = Grid.useBreakpoint();
  const isMobile = screens.lg === false;
  useEffect(() => {
    setCollapsed(isMobile);
  }, [isMobile]);
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);
  // الجروبات المفتوحة: كلها مقفولة في البداية
  const [openKeys, setOpenKeys] = useState([]);
  const invoiceTypes = useVisibleInvoiceTypes();
  // شاشات المغسلة (وحدة laundry)
  const [laundryOpen, setLaundryOpen] = useState(false);
  const laundryPages = useVisibleLaundryPages();
  // نظام المغسلة: القائمة من غير المخازن والأصناف والمبيعات
  const laundryOn = useModule("laundry");
  // نظام المطعم: الأصناف من شاشة المطعم، والبيع من الكاشير بس (من غير الفواتير والمخازن)
  const restaurantOn = useModule("restaurant");
  // تأجير العقارات: مفيش أصناف ولا وحدات قياس ولا مجموعات (الفواتير من العقود)
  const realEstateOn = useModule("realEstate");
  const simpleMode = laundryOn  //|| restaurantOn;
  // أنشطة من غير باركود (المطعم / المغسلة / تأجير العقارات - والمقاولات لما تتعمل):
  // إعدادات الباركود وطباعته مش ظاهرة
  const noBarcode = laundryOn || restaurantOn || realEstateOn;
  const [reportsOpen, setReportsOpen] = useState(false);
  const reports = useVisibleReports();
  const [accountsOpen, setAccountsOpen] = useState(false);
  const accountPages = useVisibleAccountPages();
  const t = useTranslations("Sidebar");
  // اسم مقدم الخدمة حسب النشاط (الفنيون / العاملات / الحلاقون)
  const staff = useStaffWords();
  const pathname = usePathname();
  const can = useCan();
  const currentUser = useCurrentUser();
  const ownerMode = Boolean(currentUser?.ownerMode);

  // مثال: /products/5/edit ← يتلون عنصر /products
  const menuPaths = [
    "/categories",
    "/units",
    "/products",
    "/promotions",
    "/customers",
    "/suppliers",
    "/branches",
    "/roles",
    "/users",
    "/settings/company",
    "/settings/system",
    "/settings/currencies",
    "/settings/payment-methods",
    "/settings/price-lists",
    "/settings/zatca",
    "/settings/security",
    "/settings/owner",
    "/settings/backup",
    "/zatca/documents",
    "/admin/backup",
    "/admin/data-reset",
    "/admin/products-bulk",
    "/sales/shifts",
    "/serials",
    "/warranty-claims",
    "/technicians/jobs",
    "/technicians",
    "/maintenance-contracts",
    "/real-estate/contracts",
    "/real-estate/reports",
    "/real-estate",
    "/reports/vat",
    "/reports/profit",
    "/follow-ups",
    "/vehicles",
    "/bookings",
    "/restaurant",
    // كل صفحات المغسلة تلوّن زر "المغسلة"
    "/laundry",
    // كل صفحات الحسابات تلوّن زر "الحسابات"
    "/accounts",
    "/reports",
    "/inventory/warehouses",
    "/inventory/stock",
    "/inventory/transfers",
    "/inventory/counts",
    "/inventory/adjustments",
    "/inventory/batches",
    "/printing/barcode-labels",
    "/printing/barcodes",
    "/printing/invoice",
    // كل صفحات الفواتير تلوّن زر "الفواتير"
    "/invoices",
    "/contact",
  ];
  const matchedPath = menuPaths.find((p) => pathname.startsWith(p));
  const selectedKey =
    matchedPath === "/invoices"
      ? "invoices"
      : matchedPath === "/laundry"
        ? "laundry"
        : matchedPath === "/reports"
        ? "reports"
        : matchedPath === "/accounts"
          ? "accounts"
          : (matchedPath ?? "/");
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // عنصر في القائمة يظهر فقط لو المستخدم يملك صلاحية عرض الصفحة
  // الأسماء الطويلة (البحث بالرقم التسلسلي، عقود الصيانة...) بخط أصغر
  // عشان تظهر كاملة من غير ما نعرّض القائمة
  const menuText = (text) => (
    <span
      className={
        text.length > 22
          ? "menu-label menu-label--xlong"
          : text.length > 16
            ? "menu-label menu-label--long"
            : "menu-label"
      }
      title={text}
    >
      {text}
    </span>
  );

  const link = (path, icon, labelKey, permission) =>
    !permission || can(permission)
      ? {
          key: path,
          icon,
          label: <Link href={path}>{menuText(t(labelKey, staff))}</Link>,
        }
      : null;

  // مجموعة تظهر فقط لو فيها عنصر واحد مسموح على الأقل
  const group = (key, icon, labelKey, children) => {
    const visible = children.filter(Boolean);
    return visible.length
      ? { key, icon, label: menuText(t(labelKey, staff)), children: visible }
      : null;
  };

  const menuItems = [
    link("/", <HomeFilled />, "Home"),
    // نظام المغسلة: الأقسام والوحدات والأصناف مش ظاهرة
    // (القطع وأسعارها من شاشة المغسلة)
    !laundryOn &&
      !realEstateOn &&
      link("/categories", <AppstoreOutlined />, "Categories", "categories.view"),
    !simpleMode &&
      !realEstateOn &&
      link("/units", <ColumnWidthOutlined />, "Units", "units.view"),
    !simpleMode &&
      !realEstateOn &&
      link("/products", <ShoppingOutlined />, "Products", "products.view"),
    // العروض والخصومات: في كل الأنشطة (والمغسلة كمان)
    // (تأجير العقارات: مفيش عروض ولا خصومات أصناف)
    !realEstateOn &&
      link("/promotions", <GiftOutlined />, "Promotions", "promotions.view"),
    // الفواتير: زر واحد يفتح نافذة لاختيار نوع الفاتورة (يظهر لو يقدر يفتح نوع واحد على الأقل)
    // (تأجير العقارات: الفواتير من العقود، والإشعارات لينك في مجموعته)
    invoiceTypes.length && !realEstateOn  //&& !restaurantOn
      ? {
          key: "invoices",
          icon: <FileDoneOutlined />,
          label: t("Invoices"),
          onClick: () => setInvoicePickerOpen(true),
        }
      : null,
    // الكاشير والورديات
    // نظام المغسلة: الكاشير بيتفتح من نافذة المغسلة (استلام الملابس)
    // تأجير العقارات: مفيش كاشير ولا ورديات
    !laundryOn && !realEstateOn && link("/pos", <DesktopOutlined />, "Pos", "sales.pos"),
    // الحجوزات (وحدة bookings - الكوافير / الحلاق / المساج)
    link("/bookings", <CalendarOutlined />, "Bookings", "bookings.view"),
    // المطعم / المقهى (وحدة restaurant): المنيو والأحجام والإضافات والسائقين
    link("/restaurant", <CoffeeOutlined />, "Restaurant", "restaurant.view"),
    // المغسلة (وحدة laundry): زر واحد يفتح نافذة شاشاتها (الاستلام، الطلبات، القطع والأسعار...)
    laundryPages.length
      ? {
          key: "laundry",
          icon: <SkinOutlined />,
          label: menuText(t("Laundry")),
          onClick: () => setLaundryOpen(true),
        }
      : null,
    !realEstateOn && (can("shifts.view") || can("sales.pos"))
      ? link("/sales/shifts", <FieldTimeOutlined />, "Shifts")
      : null,
    // تأجير العقارات (وحدة realEstate): الوحدات والعقارات والملّاك ونماذج العقود
    // (المجموعة كلها بتظهر بس لو النشاط مفعّل للشركة)
    group("realEstate", <BankOutlined />, "RealEstate", !realEstateOn ? [] : [
      link(
        "/real-estate/contracts",
        <FileTextOutlined />,
        "RentContracts",
        "rentContracts.view",
      ),
      link(
        "/real-estate",
        <ApartmentOutlined />,
        "RealEstateSetup",
        "realEstate.view",
      ),
      link(
        "/real-estate/reports",
        <PieChartOutlined />,
        "RentReports",
        "realEstate.reports",
      ),
      // المشتريات ومرتجعها (مصروفات العقارات من الموردين)
      link(
        "/invoices/purchases",
        <ShoppingCartOutlined />,
        "RentPurchases",
        "purchases.view",
      ),
      link(
        "/invoices/purchase-returns",
        <RollbackOutlined />,
        "RentPurchaseReturns",
        "purchaseReturns.view",
      ),
      // الإشعار الدائن والمدين على فواتير الإيجار (نفس إشعارات العملاء)
      link(
        "/invoices/sales-notes",
        <SwapOutlined />,
        "RentNotes",
        "salesNotes.view",
      ),
      // تقرير الضريبة (الإقرار) والربح: نفس التقارير العامة
      link("/reports/vat", <AuditOutlined />, "RentVat", "reports.vat"),
      link("/reports/profit", <RiseOutlined />, "RentProfit", "reports.profit"),
      // متابعة فواتير الزكاة (لو الفرع مربوط) - برضه في «الإدارة»
      link(
        "/zatca/documents",
        <FileProtectOutlined />,
        "ZatcaDocuments",
        "zatca.view",
      ),
    ]),
    // خدمات ما بعد البيع (وحدات الأنشطة): الأرقام التسلسلية، الضمان والصيانة،
    // الفنيون ومواعيدهم، عقود الصيانة الدورية
    group("afterSales", <ToolOutlined />, "AfterSales", [
      // السيارات (وحدة vehicles - الورش)
      link("/vehicles", <CarOutlined />, "Vehicles", "vehicles.view"),
      link("/serials", <NumberOutlined />, "SerialSearch", "serials.view"),
      link(
        "/warranty-claims",
        <ToolOutlined />,
        "WarrantyClaims",
        "warrantyClaims.view",
      ),
      can("technicians.jobs") || can("maintenanceContracts.visits")
        ? link("/technicians/jobs", <ScheduleOutlined />, "Jobs")
        : null,
      // المتابعة الدورية (الفلاتر والتحلية)
      link("/follow-ups", <SyncOutlined />, "FollowUps", "followUps.view"),
      link(
        "/maintenance-contracts",
        <FileSyncOutlined />,
        "MaintenanceContracts",
        "maintenanceContracts.view",
      ),
      link(
        "/technicians",
        <IdcardOutlined />,
        "Technicians",
        "technicians.view",
      ),
    ]),
    // الحسابات: زر واحد يفتح نافذة (السندات، كشوف الحساب، بنود المصروفات)
    accountPages.length
      ? {
          key: "accounts",
          icon: <WalletOutlined />,
          label: t("Accounts"),
          onClick: () => setAccountsOpen(true),
        }
      : null,
    // التقارير: زر واحد يفتح نافذة لاختيار التقرير
    reports.length
      ? {
          key: "reports",
          icon: <PieChartOutlined />,
          label: t("Reports"),
          onClick: () => setReportsOpen(true),
        }
      : null,
    // المخزون: المستودعات، الأرصدة، التحويلات، الجرد
    // نظام المغسلة: مفيش مخازن
    // تأجير العقارات: مفيش مخزون ولا مستودعات
    group("inventory", <InboxOutlined />, "Inventory", simpleMode || realEstateOn ? [] : [
      link("/inventory/stock", <BarChartOutlined />, "Stock", "stock.view"),
      // الصلاحية والدفعات (ميزة expiry): الصلاحية مقفولة لو الميزة مش في الباقة
      link(
        "/inventory/batches",
        <HourglassOutlined />,
        "Batches",
        "batches.view",
      ),
      link(
        "/inventory/transfers",
        <SwapOutlined />,
        "Transfers",
        "transfers.view",
      ),
      link(
        "/inventory/counts",
        <AuditOutlined />,
        "InventoryCounts",
        "inventoryCounts.view",
      ),
      // التوالف والزيادات
      link(
        "/inventory/adjustments",
        <DiffOutlined />,
        "Adjustments",
        "stockAdjustments.view",
      ),
      link(
        "/inventory/warehouses",
        <DatabaseOutlined />,
        "Warehouses",
        "warehouses.view",
      ),
    ]),
    group("people", <UsergroupAddOutlined />, "Pepole", [
      link("/customers", <TeamOutlined />, "Customers", "customers.view"),
      link("/suppliers", <TeamOutlined />, "Suppliers", "suppliers.view"),
      link("/users", <UserOutlined />, "Users", "users.view"),
    ]),
    // الإدارة: الفروع والأدوار، متابعة فواتير الربط
    group("administration", <ApartmentOutlined />, "Administration", [
      link("/branches", <ShopOutlined />, "Branches", "branches.view"),
      link("/roles", <SafetyCertificateOutlined />, "Roles", "roles.view"),
      link(
        "/settings/price-lists",
        <TagsOutlined />,
        "PriceLists",
        "priceLists.view",
      ),
      link(
        "/zatca/documents",
        <FileProtectOutlined />,
        "ZatcaDocuments",
        "zatca.view",
      ),
    ]),
    // الإعدادات: بيانات الشركة + الطباعة (وأي إعدادات جديدة تُضاف هنا)
    group("settings", <SettingOutlined />, "Settings", [
      link(
        "/settings/company",
        <BankOutlined />,
        "CompanyData",
        "company.view",
      ),
      link(
        "/settings/system",
        <ControlOutlined />,
        "SystemSettings",
        "systemSettings.view",
      ),
      link(
        "/settings/currencies",
        <DollarOutlined />,
        "Currencies",
        "currencies.view",
      ),
      link(
        "/settings/payment-methods",
        <CreditCardOutlined />,
        "PaymentMethods",
        "paymentMethods.view",
      ),

      // الربط مع الزكاة: لمالك البرنامج بس (لما حساب المالك متعرّف)
      link(
        "/settings/zatca",
        <CloudSyncOutlined />,
        "ZatcaIntegration",
        ownerMode ? "zatca.setup" : "zatca.view",
      ),
      // الدخول والأمان: لمالك البرنامج (فك القفل للمدير من شاشة المستخدمين)
      (ownerMode
        ? ["view", "sessions", "log"]
        : ["view", "sessions", "log", "unlock"]
      ).some((a) => can(`loginSecurity.${a}`))
        ? link("/settings/security", <LockOutlined />, "LoginSecurity")
        : null,
      // النسخ الاحتياطي: شاشة العميل (نسخة الآن + تنزيل) بالصلاحيات
      link("/admin/backup", <CloudServerOutlined />, "Backup", "backups.view"),
      // النسخ الاحتياطي الكامل (المجلد، التلقائي، الاسترجاع) لمالك البرنامج
      link(
        "/settings/backup",
        <CloudServerOutlined />,
        "BackupOwner",
        "backups.settings",
      ),
      // حساب المالك: اسمه واسم الدخول والباسورد (لمالك البرنامج بس)
      currentUser?.isOwner && ownerMode
        ? link("/settings/owner", <CrownOutlined />, "OwnerAccount")
        : null,
      // تصفير البيانات (لمالك البرنامج)
      link(
        "/admin/data-reset",
        <ClearOutlined />,
        "DataReset",
        "dataReset.run",
      ),
      // تعديل جماعي للأصناف (لمالك البرنامج) - تأجير العقارات: مفيش أصناف
      !realEstateOn &&
        link(
          "/admin/products-bulk",
          <ControlOutlined />,
          "ProductsBulk",
          "productsBulk.run",
        ),
      // الطباعة: مجموعة داخل الإعدادات (لاحقاً: إعدادات طباعة الكاشير/الفواتير)
      // الأنشطة اللي من غير باركود: طباعة الفواتير بس
      group("printing", <PrinterOutlined />, "Printing", [
        link(
          "/printing/invoice",
          <FileTextOutlined />,
          "InvoicePrinting",
          "printing.view",
        ),
        !noBarcode &&
          link(
            "/printing/barcode-labels",
            <BarcodeOutlined />,
            "BarcodeLabels",
            "printing.view",
          ),
        !noBarcode &&
          link(
            "/printing/barcodes",
            <PrinterOutlined />,
            "PrintBarcodes",
            "barcodes.print",
          ),
      ]),
    ]),
    // تواصل معنا (الدعم الفني): للكل
    link("/contact", <CustomerServiceOutlined />, "Contact"),
  ].filter(Boolean);

  // جروب واحد مفتوح فقط: فتح جروب رئيسي يقفل اللي قبله
  // (الطباعة جوه الإعدادات، فلو فتحتها تفضل الإعدادات مفتوحة)
  const ROOT_GROUPS = ["inventory", "people", "administration", "settings"];
  const onOpenChange = (keys) => {
    const opened = keys.find((k) => !openKeys.includes(k));
    setOpenKeys(opened && ROOT_GROUPS.includes(opened) ? [opened] : keys);
  };

  // ملاحظة: العرض يتحدد من width و collapsedWidth في Sider نفسه
  // (لو وضعنا minWidth هنا، زر الطي يتوقف لأن القائمة لا تصغر عن هذا العرض)
  const siderStyle = {
    overflow: "auto",
    height: "100vh",
    position: isMobile ? "fixed" : "sticky",
    insetInlineStart: 0,
    top: 0,
    zIndex: isMobile ? 1001 : undefined,
    scrollbarWidth: "thin",
    scrollbarGutter: "stable",
  };
  // الموبايل: اختيار أي عنصر يقفل القائمة
  const closeOnMobile = () => isMobile && setCollapsed(true);
  return (
    <Layout>
      {/* خلفية غامقة خلف القائمة على الموبايل (الضغط عليها يقفلها) */}
      {isMobile && !collapsed && (
        <div
          className="main-sider-backdrop"
          onClick={() => setCollapsed(true)}
        />
      )}
      <Sider
        style={siderStyle}
        width={260}
        collapsedWidth={isMobile ? 0 : 80}
        trigger={null}
        collapsible
        collapsed={collapsed}
      >
        {/* الشركة المفتوحة: اللوجو + الاسم (عشان يبان إنت على أنهي شركة) */}
        <SiderBrand collapsed={collapsed} />
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={onOpenChange}
          onClick={closeOnMobile}
          items={menuItems}
        />
        {/* تنفيذ: تكنولوجيا المعلومات */}
        <PoweredBy vendor={vendor} variant="sider" collapsed={collapsed} />
      </Sider>
      <Layout>
        {/* الهيدر 3 أجزاء: زر القائمة | المستخدم في المنتصف | الفرع + النقاط الثلاث */}
        <Header
          className="shadow-lg"
          style={{
            // ارتفاع الهيدر أقل من الافتراضي (64px) عشان يدي مساحة أكبر للشاشة
            height: isMobile ? 50 : 54,
            lineHeight: "normal",
            paddingInline: isMobile ? "0 6px" : "0 12px",
            background: colorBgContainer,
            position: "sticky",
            top: 0,
            zIndex: 10,
            width: "100%",
            display: "grid",
            // الموبايل: عمود زر القائمة ثابت (محدش يزنقه)، والنص بيتقص لو ضاق
            gridTemplateColumns: isMobile
              ? "44px minmax(0, 1fr) auto"
              : "1fr auto 1fr",
            alignItems: "center",
            gap: isMobile ? 4 : 12,
          }}
        >
          <div className="flex items-center justify-start shrink-0">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{
                fontSize: "16px",
                width: isMobile ? 40 : 44,
                height: isMobile ? 40 : 44,
              }}
            />
          </div>

          <div className="flex justify-center min-w-0">
            <UserAvatar hasName={!isMobile} />
          </div>

          <div className="flex items-center justify-end gap-1 sm:gap-2 min-w-0">
            {/* مدير النظام: تغيير الفرع الحالي */}
            <BranchSwitcher branches={branches} />
            {/* الإشعارات: الزكاة + المواعيد + العقود + الضمان */}
            <NotificationBell />
            <LanguageSwitcher />
            <HeaderMenu />
          </div>
        </Header>
        <Content
          style={{
            margin: isMobile ? "4px 4px 0 4px" : "8px 8px 0 8px",
            padding: isMobile ? 8 : 10,
            minWidth: 0,
            minHeight: "90vh",
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
          }}
        >
          <SubscriptionBanner sub={subscription} />
          {/* الفروع لاختيار فرع المستند جوه الفورم (مدير النظام) */}
          <BranchListContext.Provider value={branches}>
            {children}
          </BranchListContext.Provider>
        </Content>
      </Layout>
      {/* نافذة شاشات المغسلة */}
      <LaundryPicker open={laundryOpen} onClose={() => setLaundryOpen(false)} />
      {/* نافذة اختيار نوع الفاتورة */}
      <InvoiceTypePicker
        open={invoicePickerOpen}
        onClose={() => setInvoicePickerOpen(false)}
      />
      {/* نافذة اختيار التقرير */}
      <ReportsPicker open={reportsOpen} onClose={() => setReportsOpen(false)} />
      {/* نافذة اختيار شاشة الحسابات */}
      <AccountsPicker
        open={accountsOpen}
        onClose={() => setAccountsOpen(false)}
      />
    </Layout>
  );
};
export default MainLayout;

// أول القائمة الجانبية: لوجو الشركة واسمها (من بيانات الشركة في الإعدادات)
// القائمة مقفولة ← اللوجو بس (أو أول حرف من الاسم لو مفيش لوجو)
function SiderBrand({ collapsed }) {
  const company = useCompany();
  const locale = useLocale();
  const name =
    (locale === "ar"
      ? company?.arName || company?.enName
      : company?.enName || company?.arName) ?? "";
  const pathname = usePathname();
  // عنوان التبويب في المتصفح = اسم الشركة (بدل اسم البرنامج)
  // (Next بيرجّع العنوان الأصلي مع كل تنقل، فبنعيده مع تغيّر الصفحة)
  useEffect(() => {
    if (name) document.title = name;
  }, [name, pathname]);
  if (!name && !company?.logo) return null;
  return (
    <Link
      href="/"
      className={`sider-brand${collapsed ? " sider-brand--collapsed" : ""}`}
      title={name}
    >
      {company?.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl(company.logo)}
          alt=""
          className="sider-brand__logo"
        />
      ) : (
        <span className="sider-brand__letter">{name.trim().charAt(0)}</span>
      )}
      {!collapsed && <span className="sider-brand__name">{name}</span>}
    </Link>
  );
}
