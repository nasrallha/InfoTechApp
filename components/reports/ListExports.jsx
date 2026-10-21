"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/dates";
import ExportButtons from "./ExportButtons";

// ============================================================
// تصدير القوائم (Excel + طباعة A4 + PDF):
// العملاء، الموردين، المستخدمين، المنتجات
// ============================================================

const useNames = () => {
  const locale = useLocale();
  return {
    nm: (x) => (x ? (locale === "ar" ? x.arName : x.enName) : ""),
    un: (x) => (x ? (locale === "ar" ? x.arFullname : x.enFullname) : ""),
  };
};

// المحدد فقط (لو فيه تحديد) أو الكل + سطر يوضح ده في رأس التقرير
const useScope = () => {
  const t = useTranslations("Exports");
  return (list, selectedIds) => {
    const ids = new Set(selectedIds ?? []);
    const rows = ids.size ? list.filter((x) => ids.has(x.id)) : list;
    const info = [
      [
        t("Count"),
        ids.size
          ? t("SelectedOf", { count: rows.length, total: list.length })
          : String(list.length),
      ],
    ];
    return { rows, info };
  };
};

// kind: "customers" | "suppliers"
export function PartiesExport({ kind, parties, selectedIds }) {
  const t = useTranslations("Exports");
  const tSidebar = useTranslations("Sidebar");
  const { nm } = useNames();
  const scope = useScope();
  const title = tSidebar(kind === "customers" ? "Customers" : "Suppliers");
  const build = () => {
    const { rows: list, info } = scope(parties, selectedIds);
    return {
      title,
      info,
      columns: [
        { title: t("Code"), key: "code", type: "number", width: 8 },
        { title: t("Name"), key: "name", type: "text", width: 30 },
        { title: t("Phone"), key: "phone", type: "text", width: 14 },
        { title: t("TaxNo"), key: "taxNo", type: "text", width: 18 },
        // العملاء: المعرّف (سجل / رقم موحد / هوية ...)، والموردين: السجل التجاري
        kind === "customers"
          ? {
              title: t("IdNumber"),
              key: "registrationNo",
              type: "text",
              width: 18,
            }
          : {
              title: t("RegistrationNo"),
              key: "registrationNo",
              type: "text",
              width: 14,
            },
        { title: t("City"), key: "city", type: "text", width: 14 },
        { title: t("OpeningBalance"), key: "openingBalance", type: "money" },
        { title: t("Status"), key: "status", type: "text", width: 10 },
      ],
      rows: list.map((p) => ({
        key: p.id,
        code: p.code,
        name: nm(p),
        phone: p.phone ?? "",
        taxNo: p.taxNo ?? "",
        registrationNo:
          kind === "customers"
            ? p.idNumber
              ? `${p.idScheme}: ${p.idNumber}`
              : ""
            : (p.registrationNo ?? ""),
        city: p.city ?? "",
        openingBalance: Number(p.openingBalance ?? 0),
        status: p.isActive ? t("Active") : t("Inactive"),
      })),
      totals: {
        openingBalance: list.reduce(
          (s, p) => s + Number(p.openingBalance ?? 0),
          0,
        ),
      },
    };
  };
  return <ExportButtons build={build} disabled={!parties.length} />;
}

export function UsersExport({ users, selectedIds }) {
  const t = useTranslations("Exports");
  const tSidebar = useTranslations("Sidebar");
  const { nm, un } = useNames();
  const scope = useScope();
  const build = () => {
    const { rows: list, info } = scope(users, selectedIds);
    return {
      title: tSidebar("Users"),
      info,
      columns: [
        { title: t("Username"), key: "username", type: "text", width: 16 },
        { title: t("Name"), key: "name", type: "text", width: 26 },
        { title: t("Role"), key: "role", type: "text", width: 18 },
        { title: t("Branch"), key: "branch", type: "text", width: 18 },
        { title: t("LastLogin"), key: "lastLogin", type: "text", width: 18 },
        { title: t("Status"), key: "status", type: "text", width: 10 },
      ],
      rows: list.map((u) => ({
        key: u.id,
        username: u.username,
        name: un(u),
        role: nm(u.role),
        branch: nm(u.branch),
        lastLogin: u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "",
        status: u.isActive ? t("Active") : t("Inactive"),
      })),
    };
  };
  return <ExportButtons build={build} disabled={!users.length} />;
}

export function ProductsExport({ products, selectedIds }) {
  const t = useTranslations("Exports");
  const tSidebar = useTranslations("Sidebar");
  const { nm } = useNames();
  const scope = useScope();
  const build = () => {
    const { rows: list, info } = scope(products, selectedIds);
    return {
      title: tSidebar("Products"),
      info,
      columns: [
        { title: t("Code"), key: "code", type: "text", width: 14 },
        { title: t("Name"), key: "name", type: "text", width: 30 },
        { title: t("Category"), key: "category", type: "text", width: 16 },
        { title: t("Unit"), key: "unit", type: "text", width: 10 },
        { title: t("Cost"), key: "cost", type: "money" },
        { title: t("Price"), key: "price", type: "money" },
        { title: t("TaxRate"), key: "taxRate", type: "number", width: 8 },
        { title: t("Stock"), key: "stock", type: "qty" },
        { title: t("Status"), key: "status", type: "text", width: 10 },
      ],
      rows: list.map((p) => ({
        key: p.id,
        code: p.code,
        name: nm(p),
        category: nm(p.category),
        unit: nm(p.baseUnit),
        cost: p.cost,
        price: p.price,
        taxRate: p.taxRate,
        stock: p.stock ?? 0,
        status: p.isActive ? t("Active") : t("Inactive"),
      })),
    };
  };
  return <ExportButtons build={build} disabled={!products.length} />;
}

export function UnitsExport({ units, selectedIds }) {
  const t = useTranslations("Exports");
  const tSidebar = useTranslations("Sidebar");
  const scope = useScope();
  const build = () => {
    const { rows: list, info } = scope(units, selectedIds);
    return {
      title: tSidebar("Units"),
      info,
      columns: [
        { title: "#", key: "id", type: "number", width: 8 },
        { title: t("ArName"), key: "arName", type: "text", width: 28 },
        { title: t("EnName"), key: "enName", type: "text", width: 28 },
        { title: t("Status"), key: "status", type: "text", width: 12 },
      ],
      rows: list.map((u) => ({
        key: u.id,
        id: u.id,
        arName: u.arName,
        enName: u.enName,
        status: u.isActive ? t("Active") : t("Inactive"),
      })),
    };
  };
  return <ExportButtons build={build} disabled={!units.length} />;
}

// الأقسام: الرئيسية وتحت كل واحد أقسامه الفرعية
export function CategoriesExport({ categories, selectedIds }) {
  const t = useTranslations("Exports");
  const tSidebar = useTranslations("Sidebar");
  const { nm } = useNames();
  const scope = useScope();
  const build = () => {
    const flat = categories.flatMap((c) => [
      { ...c, parent: null },
      ...(c.children ?? []).map((ch) => ({ ...ch, parent: c })),
    ]);
    const { rows: list, info } = scope(flat, selectedIds);
    return {
      title: tSidebar("Categories"),
      info,
      columns: [
        { title: "#", key: "id", type: "number", width: 8 },
        { title: t("Name"), key: "name", type: "text", width: 30 },
        { title: t("MainCategory"), key: "parent", type: "text", width: 26 },
        { title: t("Status"), key: "status", type: "text", width: 12 },
      ],
      rows: list.map((c) => ({
        key: c.id,
        id: c.id,
        name: c.parent ? `— ${nm(c)}` : nm(c),
        parent: c.parent ? nm(c.parent) : t("MainLevel"),
        status: c.isActive ? t("Active") : t("Inactive"),
      })),
    };
  };
  return <ExportButtons build={build} disabled={!categories.length} />;
}
