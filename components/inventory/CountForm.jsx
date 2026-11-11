"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import { message } from "@/components/common/feedback";
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  PrinterOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { formatDateTime } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import {
  createCountAction,
  deleteCountAction,
  getCountSheetAction,
  postCountAction,
  searchStockProductsAction,
  updateCountAction,
} from "@/actions/inventory.actions";
import { useCurrency } from "@/components/common/CurrencyProvider";
import SearchBox from "@/components/common/SearchBox";
import { showActionError } from "@/components/common/actionError";
import ProductPicker from "@/components/purchases/ProductPicker";
import PrintDocument from "@/components/printing/PrintDocument";
import StockDocument from "./StockDocument";
import { COUNT_STATUS_COLOR } from "./CountsList";
import UnitBreakdown from "./UnitBreakdown";
import {
  breakdown,
  breakdownText,
  fromParts,
  unitsBySize,
} from "@/lib/unit-breakdown";
import { C } from "@/lib/theme";
import "@/components/purchases/purchases.css";
import "@/components/common/table.css";
import DocBranchSelect from "@/components/common/DocBranchSelect";

const q3 = (v) => Number(Number(v ?? 0).toFixed(3));

// ============================================================
// الجرد: مسودة ← ترحيل
// 1) نختار المستودع، ونحمّل الأصناف (كلها أو قسم) أو نضيف أصنافاً بالبحث
// 2) نكتب الكمية الموجودة فعلاً (بالوحدة الأساسية)، ونحفظ كمسودة أي وقت
// 3) الترحيل: الفرق بين الموجود ورصيد البرنامج يصبح حركة مخزون (زيادة/عجز)
// - الصنف بدون كمية لا يدخل الجرد، إلا لو فعّلنا "غير المعدود = صفر"
// count: null للجديد، أو الجرد (مسودة/مرحّل) من getCount
// ============================================================
export default function CountForm({
  count,
  warehouses = [],
  categories = [],
  company,
  canCreate,
  canPost,
  canDelete,
}) {
  const posted = count?.status === "posted";
  const [warehouseId, setWarehouseId] = useState(
    count?.warehouseId ??
      (warehouses.length === 1 ? warehouses[0].id : undefined),
  );
  const [notes, setNotes] = useState(count?.notes ?? "");
  const [lines, setLines] = useState(() =>
    (count?.items ?? []).map((i) => ({ ...i, countedQty: i.countedQty })),
  );
  // "all" = كل الأقسام (كل الأصناف النشطة مرة واحدة)
  const [categoryId, setCategoryId] = useState("all");
  const [filter, setFilter] = useState("");
  const [uncountedZero, setUncountedZero] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Inventory");
  const tAlerts = useTranslations("Alerts");
  const { amount: money } = useCurrency();
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const no = count ? formatDocNo("count", count.number, count.docCode) : null;
  const editable = !posted && canCreate;

  // تحميل الأصناف من البرنامج (الموجود في الجدول لا يتكرر)
  const loadSheet = async (params) => {
    if (!warehouseId) {
      message.warning(t("ChooseWarehouseFirst"));
      return null;
    }
    setLoading(true);
    const res = await getCountSheetAction({ warehouseId, ...params });
    setLoading(false);
    if (!res.success) {
      showActionError(res, tAlerts, locale);
      return null;
    }
    const have = new Set(lines.map((l) => l.productId));
    const fresh = res.data
      .filter((r) => !have.has(r.productId))
      .map((r) => ({ ...r, countedQty: null }));
    setLines((prev) => [...prev, ...fresh]);
    return fresh.length;
  };

  const loadItems = async () => {
    const added = await loadSheet(categoryId === "all" ? {} : { categoryId });
    if (added != null) message.success(t("ItemsLoaded", { count: added }));
  };

  // صنف من البحث / الماسح
  const addProduct = async (product) => {
    if (lines.some((l) => l.productId === product.id)) {
      setFilter(product.code);
      return message.info(t("ItemAlreadyInCount"));
    }
    await loadSheet({ productIds: [product.id] });
  };

  const setCounted = (productId, v) =>
    setLines((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? { ...l, countedQty: v ?? null, parts: undefined }
          : l,
      ),
    );

  // العدّ بالوحدات (كرتونة / شدة / حبة): الإجمالي بالوحدة الأساسية
  // parts = { unitId: كمية } لكل وحدة كتبها المستخدم
  const partsOf = (l) => {
    if (l.parts) return l.parts;
    if (l.countedQty == null) return {};
    return Object.fromEntries(
      breakdown(l.countedQty, l.units).map((p) => [p.unit.id, p.qty]),
    );
  };
  const setPart = (l, unitId, v) =>
    setLines((prev) =>
      prev.map((x) => {
        if (x.productId !== l.productId) return x;
        const parts = { ...partsOf(x), [unitId]: v ?? null };
        const filled = unitsBySize(x.units).filter(
          (u) => parts[u.unit.id] != null,
        );
        const countedQty = filled.length
          ? fromParts(
              filled.map((u) => ({ factor: u.factor, qty: parts[u.unit.id] })),
            )
          : null;
        return { ...x, parts, countedQty };
      }),
    );
  const multiUnit = (l) => (l.units?.length ?? 0) > 1;

  // في الطباعة: الكمية بالوحدة الأساسية وتحتها التفصيل بالوحدات
  const printQty = (l, v) => {
    const text = breakdownText(v ?? 0, l.units, nameOf);
    return (
      <>
        {q3(v)}
        {text && text !== "0" && <div className="inv__sub">{text}</div>}
      </>
    );
  };
  const removeLine = (productId) =>
    setLines((prev) => prev.filter((l) => l.productId !== productId));

  // الكمية المعتمدة لكل سطر (null = غير معدود)
  const countedOf = (l) =>
    l.countedQty == null ? (uncountedZero ? 0 : null) : l.countedQty;
  const diffOf = (l) =>
    posted
      ? l.diffQty
      : countedOf(l) == null
        ? null
        : q3(countedOf(l) - l.systemQty);

  const stats = useMemo(() => {
    let counted = 0;
    let surplus = 0;
    let shortage = 0;
    for (const l of lines) {
      const d = diffOf(l);
      if (d == null) continue;
      counted++;
      const value = d * (l.cost ?? 0);
      if (d > 0) surplus += value;
      else shortage += -value;
    }
    return { counted, surplus, shortage };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, uncountedZero, posted]);

  const payloadItems = () =>
    lines
      .filter((l) => countedOf(l) != null)
      .map((l) => ({ productId: l.productId, countedQty: countedOf(l) }));

  // حفظ المسودة ← يرجع رقم الجرد
  const save = async () => {
    const items = payloadItems();
    if (!items.length) {
      message.warning(t("NoCountedItems"));
      return null;
    }
    const res = count
      ? await updateCountAction({ id: count.id, notes, items })
      : await createCountAction({ warehouseId, notes, items });
    if (!res.success) {
      showActionError(res, tAlerts, locale);
      return null;
    }
    return res.data;
  };

  // جرد جديد اتحفظ: الشاشة ترجع فاضية (Next بيحتفظ بها في الخلفية)
  const clearNew = () => {
    if (count) return;
    setLines([]);
    setNotes("");
    setFilter("");
    setCategoryId("all");
    setUncountedZero(false);
  };

  const saveDraft = async () => {
    setBusy(true);
    const saved = await save();
    setBusy(false);
    if (!saved) return;
    message.success(
      t("CountSaved", { number: formatDocNo("count", saved.number, saved.docCode) }),
    );
    if (!count) router.push(`/inventory/counts/${saved.id}`);
    clearNew();
  };

  const post = async () => {
    setBusy(true);
    const saved = await save();
    if (!saved) return setBusy(false);
    const res = await postCountAction(saved.id);
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(
      t("CountPosted", { number: formatDocNo("count", saved.number, saved.docCode) }),
    );
    if (!count) router.push(`/inventory/counts/${saved.id}`);
    clearNew();
  };

  const remove = async () => {
    setBusy(true);
    const res = await deleteCountAction(count.id);
    setBusy(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("CountDeleted"));
    router.push("/inventory/counts");
  };

  const shown = filter.trim()
    ? lines.filter((l) => {
        const f = filter.trim().toLowerCase();
        return (
          l.code?.toLowerCase().includes(f) ||
          l.arName?.toLowerCase().includes(f) ||
          l.enName?.toLowerCase().includes(f)
        );
      })
    : lines;

  const diffCell = (d) =>
    d == null ? (
      <span className="text-gray-400">—</span>
    ) : d === 0 ? (
      <Tag>0</Tag>
    ) : (
      <Tag color={d > 0 ? "green" : "red"}>
        {d > 0 ? "+" : ""}
        {q3(d)}
      </Tag>
    );

  const columns = [
    {
      title: t("Item"),
      key: "item",
      width: 250,
      render: (_, l) => (
        <div>
          <div style={{ fontWeight: 600 }}>{nameOf(l)}</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            <bdi>{l.code}</bdi>
          </div>
        </div>
      ),
    },
    {
      title: t("Unit"),
      key: "unit",
      width: 100,
      render: (_, l) => nameOf(l.unit),
    },
    {
      title: t("SystemQty"),
      key: "system",
      width: 170,
      render: (_, l) => (
        <div>
          <span className={l.systemQty < 0 ? "text-red-600" : undefined}>
            {q3(l.systemQty)}
          </span>
          {multiUnit(l) && (
            <div className="mt-1">
              <UnitBreakdown qty={l.systemQty} units={l.units} />
            </div>
          )}
        </div>
      ),
    },
    {
      title: t("CountedQty"),
      key: "counted",
      width: 190,
      render: (_, l) =>
        editable && multiUnit(l) ? (
          <div style={{ display: "grid", gap: 4 }}>
            {unitsBySize(l.units).map((u) => (
              <InputNumber
                key={u.unit.id}
                size="small"
                style={{ width: "100%" }}
                min={0}
                precision={3}
                controls={false}
                placeholder={uncountedZero ? "0" : "—"}
                suffix={nameOf(u.unit)}
                value={partsOf(l)[u.unit.id] ?? null}
                onFocus={(e) => e.target.select()}
                formatter={(v) =>
                  v === "" || v == null ? "" : String(Number(v))
                }
                onChange={(v) => setPart(l, u.unit.id, v)}
              />
            ))}
            {l.countedQty != null && (
              <div style={{ fontSize: 12, color: C.muted }}>
                = <b>{q3(l.countedQty)}</b> {nameOf(l.unit)}
              </div>
            )}
          </div>
        ) : editable ? (
          <InputNumber
            style={{ width: "100%" }}
            min={0}
            precision={3}
            controls={false}
            placeholder={uncountedZero ? "0" : "—"}
            value={l.countedQty}
            onFocus={(e) => e.target.select()}
            formatter={(v) => (v === "" || v == null ? "" : String(Number(v)))}
            onChange={(v) => setCounted(l.productId, v)}
          />
        ) : (
          <div>
            <b>{q3(l.countedQty)}</b>
            {multiUnit(l) && (
              <div className="mt-1">
                <UnitBreakdown qty={l.countedQty} units={l.units} />
              </div>
            )}
          </div>
        ),
    },
    {
      title: t("Difference"),
      key: "diff",
      width: 170,
      render: (_, l) => {
        const d = diffOf(l);
        return (
          <div>
            {diffCell(d)}
            {d != null && d !== 0 && multiUnit(l) && (
              <div className="mt-1">
                <UnitBreakdown qty={d} units={l.units} />
              </div>
            )}
          </div>
        );
      },
    },
    posted && {
      title: t("DiffValue"),
      key: "value",
      width: 120,
      render: (_, l) => money(l.diffQty * l.cost),
    },
    editable && {
      title: "",
      key: "remove",
      width: 56,
      render: (_, l) => (
        <Button
          danger
          type="text"
          icon={<DeleteOutlined />}
          onClick={() => removeLine(l.productId)}
        />
      ),
    },
  ].filter(Boolean);
  const width = columns.reduce((s, c) => s + c.width, 0);

  const title = count ? (
    <>
      {t("Count")} <bdi>{no}</bdi>{" "}
      <Tag color={COUNT_STATUS_COLOR[count.status]}>
        {t(`CountStatus.${count.status}`)}
      </Tag>
    </>
  ) : (
    t("NewCount")
  );

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">{title}</h1>
        {/* مدير النظام: فرع المستند (الجديد بس) */}
        {!count && <DocBranchSelect />}
        <Space wrap>
          {editable && (
            <Button
              size="large"
              icon={<SaveOutlined />}
              loading={busy}
              onClick={saveDraft}
            >
              {t("SaveDraft")}
            </Button>
          )}
          {editable && canPost && (
            <Popconfirm title={t("ConfirmPost")} onConfirm={post}>
              <Button
                type="primary"
                size="large"
                icon={<CheckCircleOutlined />}
                loading={busy}
              >
                {t("PostCount")}
              </Button>
            </Popconfirm>
          )}
          {count && !posted && canDelete && (
            <Popconfirm title={t("ConfirmDeleteCount")} onConfirm={remove}>
              <Button
                danger
                size="large"
                icon={<DeleteOutlined />}
                loading={busy}
              >
                {t("Delete")}
              </Button>
            </Popconfirm>
          )}
          {count && (
            <Button
              size="large"
              icon={<PrinterOutlined />}
              onClick={() => setPrinting(true)}
            >
              {t("Print")}
            </Button>
          )}
          <Button
            size="large"
            icon={<ArrowRightOutlined />}
            onClick={() => router.push("/inventory/counts")}
          >
            {t("BackToList")}
          </Button>
        </Space>
      </div>

      {editable && (
        <Alert type="info" showIcon className="mb-3" title={t("CountHint")} />
      )}

      <Card size="small" className="mb-3">
        {count ? (
          <Descriptions
            size="small"
            column={{ xs: 1, md: 3 }}
            items={[
              {
                key: "w",
                label: t("Warehouse"),
                children: nameOf(count.warehouse),
              },
              {
                key: "d",
                label: t("Date"),
                children: <bdi>{formatDateTime(count.date)}</bdi>,
              },
              {
                key: "by",
                label: t("CreatedBy"),
                children:
                  locale === "ar"
                    ? count.createdBy?.arFullname
                    : count.createdBy?.enFullname,
              },
              posted && {
                key: "pa",
                label: t("PostedAt"),
                children: <bdi>{formatDateTime(count.postedAt)}</bdi>,
              },
              posted && {
                key: "pb",
                label: t("PostedBy"),
                children:
                  locale === "ar"
                    ? count.postedBy?.arFullname
                    : count.postedBy?.enFullname,
              },
            ].filter(Boolean)}
          />
        ) : null}

        {editable && (
          <Row gutter={12} className={count ? "mt-3" : undefined}>
            {!count && (
              <Col xs={24} md={6}>
                <div className="mb-1">{t("Warehouse")}</div>
                <Select
                  style={{ width: "100%" }}
                  value={warehouseId}
                  disabled={lines.length > 0}
                  onChange={setWarehouseId}
                  options={warehouses.map((w) => ({
                    value: w.id,
                    label: nameOf(w),
                  }))}
                />
              </Col>
            )}
            <Col xs={24} md={count ? 12 : 8}>
              <div className="mb-1">{t("Notes")}</div>
              <Input
                value={notes}
                maxLength={255}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Col>
          </Row>
        )}
        {posted && count.notes && (
          <div className="mt-2">
            {t("Notes")}: {count.notes}
          </div>
        )}
      </Card>

      {editable && (
        <Card size="small" className="mb-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Select
              showSearch
              optionFilterProp="label"
              style={{ width: 260 }}
              value={categoryId}
              onChange={(v) => setCategoryId(v ?? "all")}
              options={[
                { value: "all", label: t("AllCategoriesOption") },
                ...categories.map((c) => ({
                  value: c.id,
                  label: c.parent
                    ? `${nameOf(c.parent)} / ${nameOf(c)}`
                    : nameOf(c),
                })),
              ]}
            />
            <Button
              size="large"
              icon={<CloudDownloadOutlined />}
              loading={loading}
              disabled={!warehouseId}
              onClick={loadItems}
            >
              {t("LoadItems")}
            </Button>
            <div style={{ flex: "1 1 300px" }}>
              <ProductPicker
                disabled={!warehouseId}
                onAdd={addProduct}
                searchAction={searchStockProductsAction}
              />
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-6 mb-3">
        <div>
          <div className="text-gray-500">{t("ItemsCount")}</div>
          <b className="text-xl">{lines.length}</b>
        </div>
        <div>
          <div className="text-gray-500">{t("CountedItems")}</div>
          <b className="text-xl">{stats.counted}</b>
        </div>
        {posted && (
          <>
            <div>
              <div className="text-gray-500">{t("SurplusValue")}</div>
              <b className="text-xl text-green-700">{money(stats.surplus)}</b>
            </div>
            <div>
              <div className="text-gray-500">{t("ShortageValue")}</div>
              <b className="text-xl text-red-600">{money(stats.shortage)}</b>
            </div>
          </>
        )}
      </div>

      <Space wrap className="mb-3">
        <SearchBox
          width={300}
          placeholder={t("FilterItems")}
          value={filter}
          onChange={setFilter}
          onSearch={setFilter}
        />
        {editable && (
          <Space>
            <Switch checked={uncountedZero} onChange={setUncountedZero} />
            <span>{t("UncountedZero")}</span>
          </Space>
        )}
      </Space>

      <Table
        bordered
        size="small"
        rowKey="productId"
        columns={columns}
        dataSource={shown}
        tableLayout="fixed"
        scroll={{ x: width }}
        locale={{ emptyText: <Empty description={t("CountEmpty")} /> }}
        pagination={{
          pageSize: 50,
          showSizeChanger: false,
          hideOnSinglePage: true,
        }}
      />

      {printing && count && (
        <PrintDocument paperSize="A4" onDone={() => setPrinting(false)}>
          <StockDocument
            company={company}
            dir={locale === "ar" ? "rtl" : "ltr"}
            title={`${t("CountSheet")} ${no}`}
            meta={[
              { label: t("Warehouse"), value: nameOf(count.warehouse) },
              {
                label: t("Date"),
                value: <bdi>{formatDateTime(count.date)}</bdi>,
              },
              { label: t("Status"), value: t(`CountStatus.${count.status}`) },
              { label: t("Notes"), value: count.notes },
            ]}
            columns={[
              { title: "#", render: (_, i) => i + 1 },
              { title: t("Code"), render: (l) => <bdi>{l.code}</bdi> },
              { title: t("Item"), name: true, render: (l) => nameOf(l) },
              { title: t("Unit"), render: (l) => nameOf(l.unit) },
              {
                title: t("SystemQty"),
                render: (l) => printQty(l, l.systemQty),
              },
              {
                title: t("CountedQty"),
                render: (l) => printQty(l, l.countedQty),
              },
              {
                title: t("Difference"),
                render: (l) => printQty(l, diffOf(l) ?? 0),
              },
            ]}
            rows={lines}
            signatures={[t("CountedBy"), t("ReviewedBy"), t("ApprovedBy")]}
          />
        </PrintDocument>
      )}
    </div>
  );
}
