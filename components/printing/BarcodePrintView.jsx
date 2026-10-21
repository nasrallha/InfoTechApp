"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AutoComplete,
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { message } from "@/components/common/feedback";
import {
  BarcodeOutlined,
  DeleteOutlined,
  EyeOutlined,
  PrinterOutlined,
  ScanOutlined,
  StarFilled,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { searchLabelProductsAction } from "@/actions/barcode-print.actions";
import BarcodeLabelView from "./BarcodeLabelView";
import PrintLabels from "./PrintLabels";
import { useCurrency } from "@/components/common/CurrencyProvider";
import "./printing.css";
import "@/components/common/table.css";

// أقصى عدد ملصقات في طباعة واحدة (حماية للمتصفح)
const MAX_LABELS = 2000;

// سعر الوحدة كما يُطبع على الملصق (شامل الضريبة أو بدونها حسب القالب)
function labelPrice(product, unit, label) {
  const rate = product.taxRate / 100;
  let price = unit.price;
  if (label.priceWithTax && !product.isPriceIncludeTax)
    price = price * (1 + rate);
  if (!label.priceWithTax && product.isPriceIncludeTax)
    price = price / (1 + rate);
  return Math.round(price * 100) / 100;
}

// أول وحدة لها باركود (الأساسية غالباً)
const firstPrintableUnit = (product) =>
  product.units.find((u) => u.code) ?? product.units[0];

// rowKey لازم يكون نفسه في السيرفر والمتصفح (وإلا يظهر خطأ hydration)
// فلا نستخدم عداداً عاماً، بل مفتاحاً نمرره نحن
const newRow = (rowKey, product, unitKey, qty = 1) => ({
  rowKey,
  product,
  unitKey: unitKey ?? firstPrintableUnit(product).key,
  qty,
});

// شاشة طباعة الباركود
// labels: القوالب النشطة، initialProducts: منتجات جاية من جدول المنتجات، companyName: اسم الشركة
export default function BarcodePrintView({
  labels = [],
  initialProducts = [],
  companyName,
}) {
  const locale = useLocale();
  const t = useTranslations("BarcodePrint");
  const tPrinting = useTranslations("Printing");
  const tTable = useTranslations("Table");
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");

  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);
  const { symbol: currency } = useCurrency(); // رمز العملة الأساسية

  // القالب: الافتراضي مختار تلقائياً
  const [labelId, setLabelId] = useState(
    () => (labels.find((l) => l.isDefault) ?? labels[0])?.id ?? null,
  );
  const label = labels.find((l) => l.id === labelId) ?? null;

  // المنتجات الجاية من جدول المنتجات: مفاتيح ثابتة حسب ترتيبها (i0, i1, ...)
  const [rows, setRows] = useState(() =>
    initialProducts.map((p, i) => newRow(`i${i}`, p)),
  );
  // المنتجات المضافة من البحث: n1, n2, ... (تُنشأ في المتصفح فقط)
  const rowCounter = useRef(0);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const timer = useRef(null);
  // لو اختار من القائمة بالأسهم + Enter: لا نعالج نفس الـ Enter مرة ثانية كبحث
  const justSelected = useRef(false);

  // الرابط يتبع القائمة الحالية: ?ids=3,7 ← لو حذفت منتجاً أو مسحت القائمة يتحدث الرابط
  // فعند عمل refresh تظهر نفس المنتجات الموجودة الآن (وليس المنتجات الأولى)
  // replaceState: يغيّر الرابط فقط بدون إعادة تحميل الصفحة
  useEffect(() => {
    const ids = [...new Set(rows.map((r) => r.product.id))];
    const url = new URL(window.location.href);
    if (ids.length) url.searchParams.set("ids", ids.join(","));
    else url.searchParams.delete("ids");
    if (url.href !== window.location.href)
      window.history.replaceState(null, "", url);
  }, [rows]);

  // ------------------------------------------------------------
  // إضافة منتج للقائمة (لو نفس المنتج ونفس الوحدة موجود: نزود العدد 1)
  // ------------------------------------------------------------
  const addProduct = (product, unitKey) => {
    const key = unitKey ?? firstPrintableUnit(product).key;
    setRows((prev) => {
      const existing = prev.find(
        (r) => r.product.id === product.id && r.unitKey === key,
      );
      if (existing) {
        return prev.map((r) =>
          r === existing ? { ...r, qty: Math.min(r.qty + 1, 999) } : r,
        );
      }
      return [...prev, newRow(`n${++rowCounter.current}`, product, key)];
    });
  };

  // بحث أثناء الكتابة (بعد توقف 300ms)
  const onSearch = (value) => {
    setSearch(value);
    clearTimeout(timer.current);
    if (!value.trim()) return setOptions([]);

    timer.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchLabelProductsAction(value);
      setSearching(false);
      if (!res.success) return message.error(tAlerts(res.error));

      setOptions(
        res.data.map((p) => ({
          value: String(p.id),
          product: p,
          label: (
            <div className="flex justify-between gap-3">
              <span className="font-bold truncate">{nameOf(p)}</span>
              <span className="text-slate-400" dir="ltr">
                {p.units[0].code}
              </span>
            </div>
          ),
        })),
      );
    }, 300);
  };

  // Enter (الماسح يرسل الكود ثم Enter): لو الكود مطابق لوحدة ← نضيفها مباشرة
  const onEnter = async () => {
    const code = search.trim();
    await new Promise((r) => setTimeout(r, 0));
    if (justSelected.current || !code) return;
    clearTimeout(timer.current);

    setSearching(true);
    const res = await searchLabelProductsAction(code);
    setSearching(false);
    if (!res.success) return message.error(tAlerts(res.error));

    for (const p of res.data) {
      const unit = p.units.find((u) => u.code === code);
      if (unit) {
        addProduct(p, unit.key);
        setSearch("");
        setOptions([]);
        return;
      }
    }

    // نتيجة واحدة فقط بالاسم ← نضيفها
    if (res.data.length === 1) {
      addProduct(res.data[0]);
      setSearch("");
      setOptions([]);
      return;
    }

    if (res.data.length === 0) message.warning(t("NotFound"));
  };

  const updateRow = (rowKey, patch) =>
    setRows((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r)),
    );

  const removeRow = (rowKey) =>
    setRows((prev) => prev.filter((r) => r.rowKey !== rowKey));

  // ------------------------------------------------------------
  // الملصقات النهائية (كل سطر يتكرر بعدد ملصقاته)
  // ------------------------------------------------------------
  const totalLabels = rows.reduce((sum, r) => sum + (r.qty || 0), 0);

  const items = useMemo(() => {
    if (!label) return [];
    const list = [];
    for (const r of rows) {
      const unit = r.product.units.find((u) => u.key === r.unitKey);
      if (!unit?.code) continue;
      const item = {
        name: unit.isBase
          ? nameOf(r.product)
          : `${nameOf(r.product)} - ${nameOf(unit.unit)}`,
        code: unit.code,
        price: labelPrice(r.product, unit, label),
      };
      for (let i = 0; i < (r.qty || 0); i++) list.push(item);
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, label, locale]);

  const onPrint = () => {
    if (!label) return message.error(t("NoTemplate"));
    if (items.length === 0) return message.warning(t("NothingToPrint"));
    if (items.length > MAX_LABELS)
      return message.error(t("TooMany", { max: MAX_LABELS }));
    setPrinting(true);
  };

  const onPrintDone = useCallback(() => setPrinting(false), []);

  // ------------------------------------------------------------
  // الجدول
  // ------------------------------------------------------------
  const columns = [
    {
      title: tTable("Name"),
      key: "name",
      width: 260,
      ellipsis: true,
      render: (_, r) => <span className="font-bold">{nameOf(r.product)}</span>,
    },
    {
      title: t("Unit"),
      key: "unit",
      width: 170,
      align: "center",
      render: (_, r) => (
        <Select
          value={r.unitKey}
          style={{ width: "100%" }}
          onChange={(unitKey) => updateRow(r.rowKey, { unitKey })}
          options={r.product.units.map((u) => ({
            value: u.key,
            disabled: !u.code,
            label: u.code
              ? nameOf(u.unit)
              : `${nameOf(u.unit)} (${t("NoBarcode")})`,
          }))}
        />
      ),
    },
    {
      title: tTable("Code"),
      key: "code",
      width: 170,
      align: "center",
      render: (_, r) => (
        <span dir="ltr">
          {r.product.units.find((u) => u.key === r.unitKey)?.code ?? "-"}
        </span>
      ),
    },
    {
      title: (
        <span>
          {tTable("Price")}{" "}
          {label && (
            <span className="text-xs opacity-75">
              (
              {label.priceWithTax
                ? tPrinting("PriceWithTax")
                : tPrinting("PriceWithoutTax")}
              )
            </span>
          )}
        </span>
      ),
      key: "price",
      width: 170,
      align: "center",
      render: (_, r) => {
        const unit = r.product.units.find((u) => u.key === r.unitKey);
        return label && unit
          ? labelPrice(r.product, unit, label).toFixed(2)
          : "-";
      },
    },
    {
      title: t("Quantity"),
      key: "qty",
      width: 140,
      align: "center",
      render: (_, r) => (
        <InputNumber
          min={1}
          max={999}
          precision={0}
          value={r.qty}
          onChange={(qty) => updateRow(r.rowKey, { qty: qty ?? 1 })}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "",
      key: "remove",
      width: 70,
      align: "center",
      render: (_, r) => (
        <Button
          danger
          type="text"
          icon={<DeleteOutlined />}
          onClick={() => removeRow(r.rowKey)}
        />
      ),
    },
  ];

  const TABLE_WIDTH = columns.reduce((sum, c) => sum + (c.width ?? 0), 0);

  // لا توجد قوالب نشطة
  if (labels.length === 0) {
    return <Empty description={t("NoTemplates")} style={{ marginTop: 60 }} />;
  }

  return (
    <div className="barcode-print">
      {/* العنوان + القالب */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="font-bold text-xl m-0">
          <BarcodeOutlined /> {t("Title")}
        </h1>
        <Space wrap>
          <span className="text-slate-600 font-bold">{t("Template")}:</span>
          <Select
            value={labelId}
            onChange={setLabelId}
            style={{ minWidth: 220 }}
            options={labels.map((l) => ({
              value: l.id,
              label: (
                <span>
                  {l.isDefault && (
                    <StarFilled
                      style={{ color: "#d4a017", marginInlineEnd: 6 }}
                    />
                  )}
                  {nameOf(l)}{" "}
                  <span className="text-slate-400" dir="ltr">
                    ({l.width}×{l.height})
                  </span>
                </span>
              ),
            }))}
          />
        </Space>
      </div>

      {/* البحث / الماسح */}
      <Card size="small" className="mb-4">
        <AutoComplete
          value={search}
          options={options}
          onSearch={onSearch}
          onChange={setSearch}
          defaultActiveFirstOption={false}
          onSelect={(_, option) => {
            justSelected.current = true;
            setTimeout(() => (justSelected.current = false), 50);
            addProduct(option.product);
            setSearch("");
            setOptions([]);
          }}
          style={{ width: "100%" }}
          popupMatchSelectWidth
        >
          <Input
            size="large"
            allowClear
            autoFocus
            prefix={<ScanOutlined className="text-slate-400" />}
            placeholder={t("SearchPlaceholder")}
            onPressEnter={onEnter}
            suffix={
              searching ? (
                <span className="text-xs text-slate-400">...</span>
              ) : null
            }
          />
        </AutoComplete>
        <p className="text-xs text-slate-400 mt-2 mb-0">{t("ScanHint")}</p>
      </Card>

      {/* القائمة */}
      <Table
        bordered
        size="small"
        rowKey="rowKey"
        columns={columns}
        dataSource={rows}
        pagination={false}
        tableLayout="fixed"
        scroll={{ x: TABLE_WIDTH, y: 420 }}
        locale={{ emptyText: <Empty description={t("Empty")} /> }}
      />

      {/* الإجمالي + الأزرار */}
      <div className="barcode-print__footer">
        <div className="flex items-center gap-2">
          <span className="text-slate-600">{t("TotalLabels")}:</span>
          <Tag
            color={totalLabels > MAX_LABELS ? "red" : "geekblue"}
            style={{ fontSize: 16, padding: "4px 12px" }}
          >
            {totalLabels}
          </Tag>
          {rows.length > 0 && (
            <Button type="link" danger onClick={() => setRows([])}>
              {t("ClearAll")}
            </Button>
          )}
        </div>
        <Space>
          <Button
            size="large"
            icon={<EyeOutlined />}
            disabled={!items.length}
            onClick={() => setPreviewOpen(true)}
          >
            {t("Preview")}
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<PrinterOutlined />}
            disabled={!items.length}
            loading={printing}
            onClick={onPrint}
          >
            {t("Print")}
          </Button>
        </Space>
      </div>

      {/* المعاينة: ملصق واحد من كل سطر */}
      <Modal
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={760}
        title={t("Preview")}
        destroyOnHidden
      >
        <div className="barcode-print__preview">
          {label &&
            rows
              .map((r) => ({
                r,
                unit: r.product.units.find((u) => u.key === r.unitKey),
              }))
              .filter(({ unit }) => unit?.code)
              .map(({ r, unit }) => (
                <div
                  key={r.rowKey}
                  className="flex flex-col items-center gap-1"
                >
                  <div className="label-preview">
                    <BarcodeLabelView
                      label={label}
                      item={{
                        name: unit.isBase
                          ? nameOf(r.product)
                          : `${nameOf(r.product)} - ${nameOf(unit.unit)}`,
                        code: unit.code,
                        price: labelPrice(r.product, unit, label),
                      }}
                      companyName={companyName}
                      currency={currency}
                    />
                  </div>
                  <span className="text-xs text-slate-500">× {r.qty}</span>
                </div>
              ))}
        </div>
      </Modal>

      {/* الطباعة الفعلية */}
      {printing && label && (
        <PrintLabels
          label={label}
          items={items}
          companyName={companyName}
          currency={currency}
          onDone={onPrintDone}
        />
      )}
    </div>
  );
}
