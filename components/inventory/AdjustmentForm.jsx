"use client";

import { useEffect, useState } from "react";
import { lineQtyProblem } from "@/lib/unit-qty";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { DeleteOutlined, SaveOutlined, UndoOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { formatDay, today } from "@/lib/dates";
import { formatDocNo } from "@/lib/doc-number";
import {
  browseStockProductsAction,
  createAdjustmentAction,
  inStockSerialsAction,
  searchStockProductsAction,
  updateAdjustmentAction,
} from "@/actions/inventory.actions";
import { useModule } from "@/components/auth/AuthProvider";
import { message } from "@/components/common/feedback";
import DayPicker from "@/components/common/DayPicker";
import StatusFilters from "@/components/common/StatusFilters";
import { showActionError } from "@/components/common/actionError";
import ProductPicker from "@/components/purchases/ProductPicker";
import ProductBrowser from "@/components/purchases/ProductBrowser";
import LineSerials from "@/components/serials/LineSerials";
import LineBatches, { batchesComplete } from "@/components/batches/LineBatches";
import { productBatchesAction } from "@/actions/inventory.actions";
import { ADJUSTMENT_COLORS } from "./AdjustmentsList";
import "@/components/purchases/purchases.css";
import "@/components/common/table.css";
import DocBranchSelect from "@/components/common/DocBranchSelect";

let lineKey = 0;

const factorOf = (l) =>
  l.product.units.find((u) => u.unit.id === l.unitId)?.factor ?? 1;
const piecesOf = (l) =>
  Math.round(Number(l.qty || 0) * factorOf(l) * 1000) / 1000;
const serialLabel = (s) =>
  s.serial2 ? `${s.serial} / ${s.serial2}` : s.serial;

// سطر جديد من صنف شاشة الاختيار
const newLine = (product, unitId, qty) => ({
  key: ++lineKey,
  product,
  unitId,
  qty,
  reason: "",
  serialIds: [], // التالف: القطع المختارة
  serialOpts: null, // التالف: القطع اللي في المحل (بتتجاب أول ما الصنف يتضاف)
  serials: [], // الزيادة: أرقام جديدة
  // تتبع الصلاحية: الزيادة ← دفعاتها / التالف ← دفعة معيّنة (فاضي = الأقرب انتهاءً)
  batches: [],
  batchId: null,
  batchOpts: null, // دفعات الصنف في المستودع (للتالف)
  batchWh: null, // المستودع اللي اتجابت دفعاته
});

// ============================================================
// مستند تالف / زيادة (جديد أو تعديل)
// - النوع فوق: تالف (ينزل من المخزون) أو زيادة (يتضاف) - في التعديل ثابت
// - الصنف بالكود/الباركود/الاسم (ProductPicker) أو من التصفح بالقسم
// - السبب لكل سطر (إلزامي في التالف)
// - الصنف بأرقام تسلسلية: التالف ← اختيار القطع، الزيادة ← أرقام جديدة (اختياري)
// adjustment + products: في التعديل (المستند المحفوظ وأصنافه بشكل شاشة الاختيار)
// ============================================================
export default function AdjustmentForm({
  warehouses = [],
  defaultWarehouseId,
  categories = [],
  canChangeDate,
  initialType = "damage",
  adjustment = null,
  products = [],
  // التعديل: دفعات المستند لكل صنف (تتبع الصلاحية)
  docBatches = {},
}) {
  const isEdit = Boolean(adjustment);
  const [form] = Form.useForm();
  const [type, setType] = useState(adjustment?.type ?? initialType);
  const [lines, setLines] = useState(() =>
    isEdit
      ? adjustment.items
          .map((it) => {
            const product = products.find((p) => p.id === it.productId);
            if (!product) return null;
            return {
              ...newLine(product, it.unitId, it.qty),
              reason: it.reason ?? "",
              serialIds: it.damagedSerials.map((s) => s.id),
              // القطع التالفة بالمستند ده بتفضل اختيار متاح
              serialOpts: product.serialCount > 0 ? null : [],
              keepOpts: it.damagedSerials,
              serials: it.surplusSerials.map((s) => ({
                serial: s.serial,
                serial2: s.serial2,
                isUsed: s.isUsed,
              })),
              // تتبع الصلاحية: دفعات المستند المحفوظة
              ...(product.trackExpiry
                ? (() => {
                    const f =
                      product.units.find((u) => u.unit.id === it.unitId)
                        ?.factor ?? 1;
                    const list = docBatches[it.productId] ?? [];
                    return adjustment.type === "surplus"
                      ? {
                          batches: list.map((b) => ({
                            batchNo: b.batchNo,
                            mfgDate: b.mfgDate,
                            expDate: b.expDate,
                            qty: Math.round((b.qty / f) * 1000) / 1000,
                          })),
                        }
                      : { batchId: list.length === 1 ? list[0].batchId : null };
                  })()
                : {}),
            };
          })
          .filter(Boolean)
      : [],
  );
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const serialsOn = useModule("serials");
  const t = useTranslations("Adjustments");
  const tI = useTranslations("Inventory");
  const tS = useTranslations("Serials");
  const tAlerts = useTranslations("Alerts");
  const tBatches = useTranslations("Batches");
  const nameOf = (x) => (x ? (locale === "ar" ? x.arName : x.enName) : "");
  const todayDay = today();
  const isDamage = type === "damage";
  const tracked = (l) => serialsOn && l.product.serialCount > 0;

  const patch = (key, change) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...change } : l)),
    );

  // القطع اللي في المحل للصنف (مرة واحدة لكل سطر)
  const loadSerials = async (line) => {
    const res = await inStockSerialsAction(line.product.id);
    const list = res.success ? res.data : [];
    const keep = (line.keepOpts ?? []).filter(
      (k) => !list.some((x) => x.id === k.id),
    );
    patch(line.key, { serialOpts: [...keep, ...list] });
  };

  // التعديل: نجيب القطع للسطور اللي بأرقام أول ما الشاشة تفتح
  useEffect(() => {
    if (!isEdit || !serialsOn) return;
    lines.filter((l) => l.serialOpts === null).forEach((l) => loadSerials(l));
    // مرة واحدة مع فتح المستند
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // إضافة صنف (لو موجود بنفس الوحدة: نزود الكمية)
  const addProduct = (product, unitId, opts = {}) => {
    if (product.isService) return message.warning(t("ServiceNoStock"));
    const add = opts.qty ?? 1;
    const existing = lines.find(
      (l) => l.product.id === product.id && l.unitId === unitId,
    );
    if (existing) {
      patch(existing.key, {
        qty: Number((existing.qty + add).toFixed(3)),
      });
      return;
    }
    const line = newLine(product, unitId, add);
    if (!(serialsOn && product.serialCount > 0)) line.serialOpts = [];
    setLines((prev) => [...prev, line]);
    if (serialsOn && product.serialCount > 0) loadSerials(line);
  };

  const remove = (key) => setLines((prev) => prev.filter((l) => l.key !== key));

  // تتبع الصلاحية: دفعات الأصناف المتتبعة في المستودع المختار (للتالف)
  const warehouseId = Form.useWatch("warehouseId", form);
  useEffect(() => {
    if (!isDamage || !warehouseId) return;
    for (const l of lines) {
      if (!l.product.trackExpiry || l.batchWh === warehouseId) continue;
      productBatchesAction({
        productId: l.product.id,
        warehouseId,
      }).then((res) =>
        patch(l.key, {
          batchOpts: res.success ? res.data : [],
          batchWh: warehouseId,
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDamage, warehouseId, lines.length]);

  const reset = () => {
    setLines([]);
    setTried(false);
    form.resetFields();
  };

  // التالف بأرقام: المطلوب = الكمية (أو عدد اللي في المحل لو أقل)
  const serialNeed = (l) =>
    Math.min(Math.round(piecesOf(l)), l.serialOpts?.length ?? 0);
  const serialsBad = (l) =>
    isDamage && tracked(l) && l.serialIds.length !== serialNeed(l);

  const submit = async (values) => {
    setTried(true);
    if (!lines.length) return message.warning(tAlerts("NoItems"));
    if (lines.some((l) => !(l.qty > 0)))
      return message.warning(tAlerts("MustBePositive"));
    if (isDamage && lines.some((l) => !l.reason.trim()))
      return message.warning(t("ReasonRequired"));
    if (lines.some(serialsBad)) return message.warning(t("PickSerials"));
    // الزيادة: دفعات الأصناف المتتبعة بالصلاحية لازم تكون كاملة
    if (
      !isDamage &&
      lines.some(
        (l) =>
          !batchesComplete({
            trackExpiry: l.product.trackExpiry,
            qty: l.qty,
            batches: l.batches,
          }),
      )
    )
      return message.warning(tBatches("CompleteBatches"));
    setSaving(true);
    const payload = {
      ...values,
      type,
      date: canChangeDate ? values.date : undefined,
      items: lines.map((l) => ({
        productId: l.product.id,
        unitId: l.unitId,
        qty: l.qty,
        reason: l.reason.trim() || null,
        serialIds: isDamage && tracked(l) ? l.serialIds : [],
        serials: !isDamage && tracked(l) ? l.serials : [],
        batches: !isDamage && l.product.trackExpiry ? l.batches : [],
        batchId: isDamage && l.product.trackExpiry ? l.batchId : null,
      })),
    };
    const res = isEdit
      ? await updateAdjustmentAction({ ...payload, id: adjustment.id })
      : await createAdjustmentAction(payload);
    setSaving(false);
    if (!res.success) {
      if (res.fieldErrors) {
        form.setFields(
          Object.entries(res.fieldErrors)
            .filter(([name]) => !name.startsWith("items"))
            .map(([name, err]) => ({ name, errors: [tAlerts(err)] })),
        );
      }
      return showActionError(res, tAlerts, locale);
    }
    const no = formatDocNo("adjustment", res.data.number, res.data.docCode);
    message.success(
      isEdit ? t("Updated", { number: no }) : t("Saved", { number: no }),
    );
    router.push(`/inventory/adjustments/${res.data.id}`);
    // الشاشة ترجع فاضية لمستند جديد (Next بيحتفظ بها في الخلفية)
    if (!isEdit) reset();
  };

  const columns = [
    { title: "#", key: "i", width: 50, render: (_, __, i) => i + 1 },
    {
      title: tI("Item"),
      key: "item",
      width: 240,
      render: (_, l) => (
        <div>
          <div className="pur-line__name">{nameOf(l.product)}</div>
          <div className="pur-line__code">
            <bdi>{l.product.code}</bdi>
          </div>
          {/* تتبع الصلاحية: الزيادة ← دفعاتها بتاريخها */}
          {!isDamage && (
            <LineBatches
              line={{
                trackExpiry: l.product.trackExpiry,
                qty: l.qty,
                batches: l.batches,
              }}
              onChange={({ batches }) => patch(l.key, { batches })}
            />
          )}
          {/* التالف: من دفعة معيّنة (أو الأقرب انتهاءً تلقائياً) */}
          {isDamage && l.product.trackExpiry && (
            <Select
              size="small"
              className="mt-1"
              style={{ width: "100%" }}
              loading={l.batchOpts === null}
              value={l.batchId ?? 0}
              onChange={(v) => patch(l.key, { batchId: v || null })}
              options={[
                { value: 0, label: tBatches("AutoFefo") },
                ...(l.batchOpts ?? []).map((b) => ({
                  value: b.id,
                  label: `${b.batchNo === "-" ? tBatches("NoBatchLabel") : b.batchNo}${b.expDate ? ` — ${formatDay(b.expDate)}` : ""} (${b.qty})`,
                })),
              ]}
            />
          )}
          {/* الزيادة: أرقام القطع الجديدة (اختياري زي الشراء) */}
          {!isDamage && tracked(l) && (
            <LineSerials
              line={{
                ...l.product,
                qty: l.qty,
                serials: l.serials,
                warrantyMonths: 0,
              }}
              factor={factorOf(l)}
              withWarranty={false}
              optional
              onChange={({ serials }) => patch(l.key, { serials })}
            />
          )}
        </div>
      ),
    },
    {
      title: tI("Unit"),
      key: "unit",
      width: 120,
      render: (_, l) => (
        <Select
          style={{ width: "100%" }}
          value={l.unitId}
          onChange={(v) => patch(l.key, { unitId: v })}
          options={l.product.units.map((u) => ({
            value: u.unit.id,
            label: nameOf(u.unit),
          }))}
        />
      ),
    },
    {
      title: tI("Qty"),
      key: "qty",
      width: 110,
      render: (_, l) => (
        <InputNumber
          style={{ width: "100%" }}
          min={0}
          precision={3}
          controls={false}
          value={l.qty}
          status={
            l.qty > 0 && !lineQtyProblem({ ...l, units: l.product.units })
              ? undefined
              : "error"
          }
          onFocus={(e) => e.target.select()}
          formatter={(v) => (v === "" || v == null ? "" : String(Number(v)))}
          onChange={(v) => patch(l.key, { qty: v ?? 0 })}
        />
      ),
    },
    // التالف: اختيار القطع التالفة (بالبحث أو بالماسح)
    ...(isDamage && serialsOn && lines.some(tracked)
      ? [
          {
            title: tS("ModalTitle"),
            key: "serials",
            width: 260,
            render: (_, l) =>
              tracked(l) ? (
                <div>
                  <Select
                    mode="multiple"
                    showSearch
                    allowClear
                    style={{ width: "100%" }}
                    loading={l.serialOpts === null}
                    placeholder={t("PickSerialsPlaceholder")}
                    optionFilterProp="label"
                    value={l.serialIds}
                    status={tried && serialsBad(l) ? "error" : undefined}
                    onChange={(v) => patch(l.key, { serialIds: v })}
                    options={(l.serialOpts ?? []).map((s) => ({
                      value: s.id,
                      label: serialLabel(s),
                    }))}
                    notFoundContent={t("NoSerialsInStock")}
                  />
                  {l.serialOpts !== null && (
                    <Tag
                      className="mt-1"
                      color={serialsBad(l) ? "red" : "green"}
                    >
                      {serialNeed(l) > 0
                        ? tS("CountOf", {
                            count: l.serialIds.length,
                            total: serialNeed(l),
                          })
                        : t("NoSerialsInStock")}
                    </Tag>
                  )}
                </div>
              ) : (
                "—"
              ),
          },
        ]
      : []),
    {
      title: isDamage ? `${t("Reason")} *` : t("Reason"),
      key: "reason",
      width: 260,
      render: (_, l) => (
        <Input
          maxLength={255}
          value={l.reason}
          placeholder={
            isDamage ? t("DamagePlaceholder") : t("SurplusPlaceholder")
          }
          status={tried && isDamage && !l.reason.trim() ? "error" : undefined}
          onChange={(e) => patch(l.key, { reason: e.target.value })}
        />
      ),
    },
    {
      title: "",
      key: "remove",
      width: 56,
      render: (_, l) => (
        <Button
          danger
          type="text"
          icon={<DeleteOutlined />}
          onClick={() => remove(l.key)}
        />
      ),
    },
  ];
  const width = columns.reduce((s, c) => s + c.width, 0);

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={submit}
      initialValues={
        isEdit
          ? {
              warehouseId: adjustment.warehouse.id,
              date: adjustment.day,
              notes: adjustment.notes ?? "",
            }
          : {
              warehouseId:
                defaultWarehouseId ??
                (warehouses.length === 1 ? warehouses[0].id : undefined),
              date: todayDay,
            }
      }
    >
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="font-bold text-xl">
          {isEdit ? (
            <>
              {t("Edit")} {t(`Type_${type}`)}{" "}
              <bdi>{formatDocNo("adjustment", adjustment.number, adjustment.docCode)}</bdi>
            </>
          ) : (
            t("New")
          )}
        </h1>
        {/* مدير النظام: فرع المستند (الجديد بس) */}
        {!isEdit && <DocBranchSelect />}
        <Space>
          {isEdit ? (
            <Button
              size="large"
              onClick={() =>
                router.push(`/inventory/adjustments/${adjustment.id}`)
              }
            >
              {tI("Back")}
            </Button>
          ) : (
            <Button size="large" icon={<UndoOutlined />} onClick={reset}>
              {tI("Reset")}
            </Button>
          )}
          <Button
            type="primary"
            size="large"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saving}
            danger={isDamage}
          >
            {isEdit
              ? t("SaveChanges")
              : isDamage
                ? t("SaveDamage")
                : t("SaveSurplus")}
          </Button>
        </Space>
      </div>

      {/* النوع: تالف (أحمر) أو زيادة (أخضر) - في التعديل ثابت */}
      {!isEdit && (
        <StatusFilters
          className="mb-3"
          value={type}
          onChange={setType}
          options={["damage", "surplus"].map((k) => ({
            value: k,
            label: t(`Type_${k}`),
            color: ADJUSTMENT_COLORS[k],
          }))}
        />
      )}
      <Alert
        type={isDamage ? "error" : "success"}
        showIcon
        className="mb-3"
        title={isDamage ? t("DamageHint") : t("SurplusHint")}
        description={isEdit ? t("EditHint") : null}
      />

      <Card size="small" className="mb-3">
        <Row gutter={12}>
          <Col xs={24} md={8}>
            <Form.Item
              name="warehouseId"
              label={tI("Warehouse")}
              rules={[{ required: true, message: tAlerts("RequiredField") }]}
            >
              <Select
                options={warehouses.map((w) => ({
                  value: w.id,
                  label: nameOf(w),
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={5}>
            <Form.Item name="date" label={tI("Date")}>
              <DayPicker disabled={!canChangeDate} max={todayDay} />
            </Form.Item>
          </Col>
          <Col xs={24} md={11}>
            <Form.Item name="notes" label={tI("Notes")}>
              <Input maxLength={255} />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <Card size="small">
        <div className="flex flex-wrap gap-2 mb-3">
          <div style={{ flex: "1 1 320px" }}>
            <ProductPicker
              onAdd={addProduct}
              searchAction={searchStockProductsAction}
            />
          </div>
          <ProductBrowser
            categories={categories}
            onAdd={addProduct}
            browseAction={browseStockProductsAction}
          />
        </div>

        <Table
          bordered
          size="small"
          rowKey="key"
          columns={columns}
          dataSource={lines}
          tableLayout="fixed"
          scroll={{ x: width }}
          pagination={false}
          locale={{ emptyText: <Empty description={tI("AddItemsHint")} /> }}
        />
      </Card>
    </Form>
  );
}
