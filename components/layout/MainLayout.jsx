"use client";
import React, { useEffect, useState } from "react";
import {
  MenuFoldOutlined,
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
  AuditOutlined,
  TagsOutlined,
  DesktopOutlined,
  FieldTimeOutlined,
  WalletOutlined,
  GiftOutlined,
  PieChartOutlined,
  CloudSyncOutlined,
  FileProtectOutlined,
  CloudServerOutlined,
  ClearOutlined,
  LockOutlined,
  CrownOutlined,
} from "@ant-design/icons";
import { Button, Grid, Layout, Menu, theme } from "antd";
import { useTranslations } from "next-intl";
import UserAvatar from "./UserAvatar";
import BranchSwitcher from "./BranchSwitcher";
import HeaderMenu from "./HeaderMenu";
import ZatcaBell from "@/components/zatca/ZatcaBell";
import InvoiceTypePicker, {
  useVisibleInvoiceTypes,
} from "@/components/invoices/InvoiceTypePicker";
import AccountsPicker, {
  useVisibleAccountPages,
} from "@/components/accounts/AccountsPicker";
import ReportsPicker, {
  useVisibleReports,
} from "@/components/reports/ReportsPicker";
import LanguageSwitcher from "./LanguageSwitcher";
import { Link, usePathname } from "@/i18n/routing";
import { useCan, useCurrentUser } from "@/components/auth/AuthProvider";
import { MdCategory } from "react-icons/md";
import { BsUnity } from "react-icons/bs";
import { TbBrandProducthunt } from "react-icons/tb";

import "./MainLayout.css";

const { Header, Sider, Content } = Layout;

// branches: الفروع التي يقدر يتنقل بينها (لمدير النظام فقط، غيره قائمة فارغة)
const MainLayout = ({ children, branches = [] }) => {
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
  const [reportsOpen, setReportsOpen] = useState(false);
  const reports = useVisibleReports();
  const [accountsOpen, setAccountsOpen] = useState(false);
  const accountPages = useVisibleAccountPages();
  const t = useTranslations("Sidebar");
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
    "/sales/shifts",
    // كل صفحات الحسابات تلوّن زر "الحسابات"
    "/accounts",
    "/reports",
    "/inventory/warehouses",
    "/inventory/stock",
    "/inventory/transfers",
    "/inventory/counts",
    "/printing/barcode-labels",
    "/printing/barcodes",
    "/printing/invoice",
    // كل صفحات الفواتير تلوّن زر "الفواتير"
    "/invoices",
  ];
  const matchedPath = menuPaths.find((p) => pathname.startsWith(p));
  const selectedKey =
    matchedPath === "/invoices"
      ? "invoices"
      : matchedPath === "/reports"
        ? "reports"
        : matchedPath === "/accounts"
          ? "accounts"
          : (matchedPath ?? "/");
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // عنصر في القائمة يظهر فقط لو المستخدم يملك صلاحية عرض الصفحة
  const link = (path, icon, labelKey, permission) =>
    !permission || can(permission)
      ? { key: path, icon, label: <Link href={path}> {t(labelKey)} </Link> }
      : null;

  // مجموعة تظهر فقط لو فيها عنصر واحد مسموح على الأقل
  const group = (key, icon, labelKey, children) => {
    const visible = children.filter(Boolean);
    return visible.length
      ? { key, icon, label: t(labelKey), children: visible }
      : null;
  };

  const menuItems = [
    link("/", <HomeFilled />, "Home"),
    link("/categories", <MdCategory />, "Categories", "categories.view"),
    link("/units", <BsUnity />, "Units", "units.view"),
    link("/products", <TbBrandProducthunt />, "Products", "products.view"),
    link("/promotions", <GiftOutlined />, "Promotions", "promotions.view"),
    // الفواتير: زر واحد يفتح نافذة لاختيار نوع الفاتورة (يظهر لو يقدر يفتح نوع واحد على الأقل)
    invoiceTypes.length
      ? {
          key: "invoices",
          icon: <FileDoneOutlined />,
          label: t("Invoices"),
          onClick: () => setInvoicePickerOpen(true),
        }
      : null,
    // الكاشير والورديات
    link("/pos", <DesktopOutlined />, "Pos", "sales.pos"),
    can("shifts.view") || can("sales.pos")
      ? link("/sales/shifts", <FieldTimeOutlined />, "Shifts")
      : null,
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
    group("inventory", <InboxOutlined />, "Inventory", [
      link("/inventory/stock", <BarChartOutlined />, "Stock", "stock.view"),
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
      // الطباعة: مجموعة داخل الإعدادات (لاحقاً: إعدادات طباعة الكاشير/الفواتير)
      group("printing", <PrinterOutlined />, "Printing", [
        link(
          "/printing/invoice",
          <FileTextOutlined />,
          "InvoicePrinting",
          "printing.view",
        ),
        link(
          "/printing/barcode-labels",
          <BarcodeOutlined />,
          "BarcodeLabels",
          "printing.view",
        ),
        link(
          "/printing/barcodes",
          <PrinterOutlined />,
          "PrintBarcodes",
          "barcodes.print",
        ),
      ]),
    ]),
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
        <div className="demo-logo-vertical" />
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={onOpenChange}
          onClick={closeOnMobile}
          items={menuItems}
        />
      </Sider>
      <Layout>
        {/* الهيدر 3 أجزاء: زر القائمة | المستخدم في المنتصف | الفرع + النقاط الثلاث */}
        <Header
          className="shadow-lg"
          style={{
            paddingInline: isMobile ? "0 6px" : "0 12px",
            background: colorBgContainer,
            position: "sticky",
            top: 0,
            zIndex: 10,
            width: "100%",
            display: "grid",
            gridTemplateColumns: isMobile ? "auto 1fr auto" : "1fr auto 1fr",
            alignItems: "center",
            gap: isMobile ? 4 : 12,
          }}
        >
          <div className="flex items-center justify-start">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{
                fontSize: "16px",
                width: isMobile ? 48 : 60,
                height: isMobile ? 48 : 60,
              }}
            />
          </div>

          <div className="flex justify-center min-w-0">
            <UserAvatar hasName={!isMobile} />
          </div>

          <div className="flex items-center justify-end gap-1 sm:gap-2 min-w-0">
            {/* مدير النظام: تغيير الفرع الحالي */}
            <BranchSwitcher branches={branches} />
            <ZatcaBell />
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
          {children}
        </Content>
      </Layout>
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
