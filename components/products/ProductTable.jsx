"use client";
import { useEffect, useState } from "react";
import {
  Table,
  Space,
  Button,
  Tag,
  Popconfirm,
  Flex,
  Avatar,
  Tooltip,
} from "antd";
import { message } from "@/components/common/feedback";
import {
  PictureOutlined,
  BarcodeOutlined,
  EyeOutlined,
  ColumnHeightOutlined,
  DeleteOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useCan, useModule } from "@/components/auth/AuthProvider";
import { useRouter } from "@/i18n/routing";
import {
  textFilter,
  statusFilter,
  StatusBadge,
} from "@/components/common/tableFilters";
import { deleteProductsAction } from "@/actions/product.actions";
import { imageUrl } from "@/lib/image";
import UnitBreakdown from "@/components/inventory/UnitBreakdown";
import ProductDetailsModal from "./ProductDetailsModal";
import VariantsModal from "./VariantsModal";
import { C } from "@/lib/theme";
import "@/components/common/table.css";

// تنسيق الأرقام المالية: 1234.5 ← 1,234.50
const formatMoney = (v) =>
  Number(v ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// products: المنتجات من قاعدة البيانات (تتحدث تلقائياً بعد الحذف)
// warehouses: (المدير + أكتر من مستودع) عمود المستودعات المتاح فيها الصنف وفلتره
const ProductTable = ({ products = [], warehouses = [], onSelectionChange }) => {
  const [selectedRows, setSelectedRows] = useState([]);
  // التحديد يُستخدم كمان في التصدير (Excel / طباعة / PDF): المحدد فقط أو الكل
  useEffect(() => {
    onSelectionChange?.(selectedRows);
  }, [selectedRows, onSelectionChange]);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  // الصنف المعروض في نافذة "كارت الصنف"
  const [viewId, setViewId] = useState(null);

  const router = useRouter();
  const locale = useLocale();
  const tTable = useTranslations("Table");
  const tButtons = useTranslations("Buttons");
  const can = useCan();
  const tSerial = useTranslations("Serials");
  // الأرقام التسلسلية (وحدة serials): عمود + فلتر
  const serialsOn = useModule("serials");
  // المقاسات والألوان (وحدة variants): زرار «المقاسات» للصنف
  const variantsOn = useModule("variants");
  const tVariants = useTranslations("Variants");
  const [variantsId, setVariantsId] = useState(null);
  const canEdit = can("products.update");
  const canDelete = can("products.delete");
  const canPrint = can("barcodes.print");

  // فتح شاشة طباعة الباركود ومعها المنتجات المختارة
  const printBarcodes = (ids) =>
    router.push(`/printing/barcodes?ids=${ids.join(",")}`);
  const tForm = useTranslations("Form");
  const tAlerts = useTranslations("Alerts");

  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");

  const deleteProducts = async (ids) => {
    setDeleting(true);
    const res = await deleteProductsAction(ids);
    setDeleting(false);

    if (!res.success) {
      message.error(tAlerts(res.error));
      return;
    }

    message.success(tAlerts("ProductDeleted"));
    setSelectedRows([]);
  };

  const columns = [
    {
      // المسلسل 1، 2، 3 ... حسب الصفوف المعروضة (مش رقم السجل في القاعدة)
      // ومكمّل في الصفحات اللي بعدها (الصفحة 2 تبدأ بعد آخر رقم في الأولى)
      title: tTable("ID"),
      key: "rowNo",
      width: 70,
      align: "center",
      render: (_, __, i) => (page - 1) * pageSize + i + 1,
    },
    {
      title: tTable("Image"),
      dataIndex: "image",
      key: "image",
      width: 90,
      align: "center",
      render: (image) => (
        <Avatar
          shape="square"
          size={40}
          src={imageUrl(image)}
          icon={<PictureOutlined />}
        />
      ),
    },
    {
      title: tTable("Code"),
      dataIndex: "code",
      key: "code",
      width: 160,
      ellipsis: true,
      align: "center",
      ...textFilter({
        getValue: (r) => r.code,
        placeholder: tTable("Code"),
        tButtons,
      }),
    },
    {
      title: tTable("Name"),
      key: "name",
      width: 240,
      ellipsis: true,
      align: "center",
      render: (_, r) => (
        <>
          {nameOf(r)}
          {r.isService && (
            <Tag color="cyan" style={{ marginInlineStart: 6 }}>
              {tForm("Service")}
            </Tag>
          )}
        </>
      ),
      sorter: (a, b) => nameOf(a).localeCompare(nameOf(b)),
      // البحث في الاسم العربي والإنجليزي معاً
      ...textFilter({
        getValue: (r) => `${r.arName} ${r.enName}`,
        placeholder: tTable("Name"),
        tButtons,
      }),
    },
    {
      title: tTable("Category"),
      key: "category",
      width: 180,
      ellipsis: true,
      align: "center",
      render: (_, r) => nameOf(r.category),
      ...textFilter({
        getValue: (r) => `${r.category?.arName} ${r.category?.enName}`,
        placeholder: tTable("Category"),
        tButtons,
      }),
    },
    // المستودعات (الفروع) اللي الصنف متاح فيها - الرئيسي فيه كل الأصناف
    ...(warehouses.length
      ? [
          {
            title: tForm("AvailableIn"),
            key: "warehouses",
            width: 200,
            ellipsis: true,
            align: "center",
            filters: warehouses.map((w) => ({ text: nameOf(w), value: w.id })),
            onFilter: (id, r) =>
              r.allWarehouses ||
              warehouses.find((w) => w.id === id)?.isMain ||
              r.warehouseIds.includes(id),
            render: (_, r) =>
              r.allWarehouses ? (
                <span style={{ color: C.muted }}>{tForm("AllWarehouses")}</span>
              ) : (
                warehouses
                  .filter((w) => w.isMain || r.warehouseIds.includes(w.id))
                  .map((w) => (
                    <Tag key={w.id}>
                      {nameOf(w)}
                    </Tag>
                  ))
              ),
          },
        ]
      : []),
    {
      title: tTable("BaseUnit"),
      key: "baseUnit",
      width: 130,
      ellipsis: true,
      align: "center",
      render: (_, r) => nameOf(r.baseUnit),
    },
    {
      title: tTable("Cost"),
      dataIndex: "cost",
      key: "cost",
      width: 130,
      align: "center",
      sorter: (a, b) => a.cost - b.cost,
      render: formatMoney,
    },
    {
      title: tTable("Price"),
      dataIndex: "price",
      key: "price",
      width: 130,
      align: "center",
      sorter: (a, b) => a.price - b.price,
      render: formatMoney,
    },
    {
      title: tTable("WholesalePrice"),
      dataIndex: "wholesalePrice",
      key: "wholesalePrice",
      width: 170,
      align: "center",
      render: formatMoney,
    },
    {
      title: tTable("TaxRate"),
      dataIndex: "taxRate",
      key: "taxRate",
      width: 110,
      align: "center",
      render: (v) => `${v}%`,
    },
    // الرصيد الحالي (مجموع المستودعات التي يراها المستخدم)، وبالوحدات عند الوقوف عليه
    {
      title: tTable("Stock"),
      key: "stock",
      width: 140,
      align: "center",
      sorter: (a, b) => a.stock - b.stock,
      render: (_, r) => (
        <Tooltip
          title={
            r.units?.length > 1 ? (
              <UnitBreakdown qty={r.stock} units={r.units} />
            ) : null
          }
        >
          <b
            className={
              r.stock < 0
                ? "text-red-600"
                : r.stock === 0
                  ? "text-gray-400"
                  : undefined
            }
          >
            {Number(r.stock.toFixed(3))}
          </b>{" "}
          <span style={{ fontSize: 12, color: C.muted }}>
            {nameOf(r.baseUnit)}
          </span>
        </Tooltip>
      ),
    },
    ...(serialsOn
      ? [
          {
            title: tSerial("TrackSerial"),
            key: "serialCount",
            width: 150,
            align: "center",
            filters: [
              { text: tSerial("Tracked"), value: true },
              { text: tSerial("Count0"), value: false },
            ],
            onFilter: (v, r) => r.serialCount > 0 === v,
            render: (_, r) =>
              r.serialCount > 0 ? (
                <Tag color="purple">{tSerial(`Count${r.serialCount}`)}</Tag>
              ) : (
                <span style={{ color: C.subtle }}>—</span>
              ),
          },
        ]
      : []),
    {
      title: tTable("AdditionalUnits"),
      key: "units",
      width: 170,
      align: "center",
      render: (_, r) => r._count?.productUnits ?? 0,
    },
    {
      title: tTable("Status"),
      dataIndex: "isActive",
      key: "isActive",
      width: 130,
      align: "center",
      render: (active) => <StatusBadge active={active} tForm={tForm} />,
      ...statusFilter({ tForm }),
    },
    {
      title: (
        <Flex justify="center" align="center" gap="small">
          <span>{tTable("Actions")}</span>
          {canPrint && selectedRows.length > 0 && (
            <Button
              size="small"
              icon={<BarcodeOutlined />}
              onClick={() => printBarcodes(selectedRows)}
            >
              {tButtons("PrintBarcode")} ({selectedRows.length})
            </Button>
          )}
          {canDelete && selectedRows.length > 0 && (
            <Popconfirm
              title={tAlerts("Confirm")}
              description={tAlerts("ConfirmDelete")}
              onConfirm={() => deleteProducts(selectedRows)}
              okText={tButtons("Yes")}
              cancelText={tButtons("No")}
            >
              <Button
                color="danger"
                variant="outlined"
                size="small"
                icon={<DeleteOutlined />}
                loading={deleting}
              >
                {tButtons("Delete")} ({selectedRows.length})
              </Button>
            </Popconfirm>
          )}
        </Flex>
      ),
      key: "action",
      width: (canPrint ? 420 : 290) + (variantsOn ? 120 : 0),
      align: "center",
      fixed: locale === "ar" ? "left" : "right",
      render: (_, record) => (
        <Space size="middle">
          {/* عرض الصنف بالتفصيل (كارت الصنف) */}
          <Tag
            color={C.info}
            style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}
            icon={<EyeOutlined />}
            onClick={() => setViewId(record.id)}
          >
            {tButtons("View")}
          </Tag>

          {/* طباعة باركود لهذا المنتج */}
          {canPrint && (
            <Tag
              color={C.header}
              style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}
              icon={<BarcodeOutlined />}
              onClick={() => printBarcodes([record.id])}
            >
              {tButtons("Barcode")}
            </Tag>
          )}

          {/* المقاسات والألوان (وحدة variants) */}
          {variantsOn && !record.isService && (
            <Tag
              color={record.modelId ? C.success : C.muted}
              style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}
              icon={<ColumnHeightOutlined />}
              onClick={() => setVariantsId(record.id)}
            >
              {tVariants("Button")}
            </Tag>
          )}

          {/* التعديل في صفحة مستقلة لأن فورم المنتج كبير */}
          {canEdit && (
            <Tag
              color={C.primary}
              style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}
              icon={<EditOutlined />}
              onClick={() => router.push(`/products/${record.id}/edit`)}
            >
              {tButtons("Edit")}
            </Tag>
          )}

          {canDelete && (
            <Popconfirm
              title={tAlerts("Confirm")}
              description={tAlerts("ConfirmDelete")}
              onConfirm={() => deleteProducts([record.id])}
              okText={tButtons("Yes")}
              cancelText={tButtons("No")}
            >
              <Tag
                color={C.danger}
                variant="filled"
                style={{ padding: "6px 12px", fontSize: 14, cursor: "pointer" }}
                icon={<DeleteOutlined />}
              >
                {tButtons("Delete")}
              </Tag>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // مجموع عرض الأعمدة + عمود التحديد (checkbox)
  const TABLE_WIDTH = columns.reduce((sum, c) => sum + (c.width ?? 0), 50);

  return (
    <>
      <Table
        bordered
        rowKey="id"
        columns={columns}
        dataSource={products}
        loading={deleting}
        /* عرض ثابت لكل عمود حتى يتطابق الهيدر مع الصفوف (مهم مع scroll.y) */
        tableLayout="fixed"
        scroll={{ x: TABLE_WIDTH, y: 500 }}
        size="small"
        pagination={{
          current: page,
          pageSize,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
        // التحديد متاح دائماً (للتصدير والباركود)، والحذف بصلاحيته
        rowSelection={{
          selectedRowKeys: selectedRows,
          onChange: (keys) => setSelectedRows(keys),
        }}
      />
      <ProductDetailsModal productId={viewId} onClose={() => setViewId(null)} />
      {variantsId && (
        <VariantsModal
          productId={variantsId}
          onClose={() => setVariantsId(null)}
        />
      )}
    </>
  );
};

export default ProductTable;
