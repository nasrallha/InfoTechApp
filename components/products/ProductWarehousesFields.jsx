"use client";

import {
  Checkbox,
  Flex,
  Form,
  InputNumber,
  Select,
  Switch,
  Table,
  Tag,
  Tooltip,
} from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { C } from "@/lib/theme";

// ============================================================
// شاشة الصنف: المستودعات (الفروع) اللي الصنف متاح فيها + رصيده الافتتاحي في كل واحد
// - «متاح في كل المستودعات» (المدير): كل الفروع بتشوف الصنف
//   مقفولة: الصنف بيظهر في الفروع المعلّمة بس (الرئيسي فيه كل الأصناف دايماً)
// - الرصيد الافتتاحي لكل مستودع فرع بالوحدة المختارة
//   (رصيد المستودع الرئيسي في خانات الرصيد الافتتاحي فوق)
// - موظف الفرع: صف مستودع فرعه بس
// القيمة (Form name="stores"): [{ warehouseId, available, openingQty, openingUnitId }]
// ============================================================

// الصفوف الأولية: كل مستودعات الفروع (من غير الرئيسي) + بيانات الصنف لو تعديل
export function initialStores(stores, product) {
  const saved = new Map(
    (product?.warehouses ?? []).map((w) => [w.warehouseId, w]),
  );
  return (stores?.warehouses ?? [])
    .filter((w) => !w.isMain)
    .map((w) => {
      const s = saved.get(w.id);
      return {
        warehouseId: w.id,
        // جديد: معلّم (لو قفل «كل المستودعات» يشيل اللي مش عايزه)
        available: product ? Boolean(s) : true,
        openingQty: s?.openingQty || null,
        openingUnitId: s?.openingUnitId ?? null,
      };
    });
}

// حامل قيمة الجدول جوه الفورم (مالوش شكل)
const ValueHolder = () => null;

// الجدول بيظهر لو فيه مستودع فرع واحد على الأقل
export const hasBranchStores = (stores) =>
  (stores?.warehouses ?? []).some((w) => !w.isMain);

export default function ProductWarehousesFields({
  form,
  stores,
  units,
  isService,
}) {
  const t = useTranslations("Form");
  const locale = useLocale();
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName);
  const all = Boolean(stores?.all);
  const allWarehouses = Form.useWatch("allWarehouses", form) ?? true;
  const rows = Form.useWatch("stores", form) ?? [];
  const baseUnitId = Form.useWatch("baseUnitId", form);
  const extraUnits = Form.useWatch("units", form) ?? [];
  const unitName = (id) => {
    const u = units.find((x) => x.id === id);
    return u ? nameOf(u) : "";
  };
  // الوحدات: الأساسية + الإضافية (كرتونة...)
  const unitOptions = [
    ...(baseUnitId ? [{ value: baseUnitId, label: unitName(baseUnitId) }] : []),
    ...extraUnits
      .filter((u) => u?.unitId && u.unitId !== baseUnitId)
      .map((u) => ({ value: u.unitId, label: unitName(u.unitId) })),
  ];
  // موظف الفرع: الصنف الجديد بيتقفل على فرعه
  const limited = all ? !allWarehouses : true;

  const setRow = (warehouseId, patch) =>
    form.setFieldValue(
      "stores",
      rows.map((r) => (r.warehouseId === warehouseId ? { ...r, ...patch } : r)),
    );
  const byId = new Map(stores.warehouses.map((w) => [w.id, w]));
  const main = stores.warehouses.find((w) => w.isMain);
  const branchesOf = (w) => w.branches?.map(nameOf).join("، ");

  const data = [
    ...(main && all ? [{ key: "main", main: true, w: main }] : []),
    ...rows.map((r) => ({ key: r.warehouseId, row: r, w: byId.get(r.warehouseId) })),
  ].filter((x) => x.w);

  const columns = [
    {
      title: t("Warehouse"),
      render: (_, x) => (
        <div>
          <b>{nameOf(x.w)}</b>
          {branchesOf(x.w) && (
            <div style={{ color: C.muted, fontSize: 12 }}>{branchesOf(x.w)}</div>
          )}
        </div>
      ),
    },
    {
      title: t("Available"),
      width: 110,
      align: "center",
      render: (_, x) =>
        x.main ? (
          <Tag color="green">{t("MainAlways")}</Tag>
        ) : (
          <Checkbox
            checked={limited ? x.row.available : true}
            disabled={!limited || !all}
            onChange={(e) => setRow(x.row.warehouseId, { available: e.target.checked })}
          />
        ),
    },
    ...(isService
      ? []
      : [
          {
            title: t("OpeningQty"),
            width: 160,
            render: (_, x) =>
              x.main ? (
                <span style={{ color: C.muted, fontSize: 12 }}>
                  {t("MainOpeningHint")}
                </span>
              ) : (
                <InputNumber
                  min={0}
                  max={1000000}
                  style={{ width: "100%" }}
                  value={x.row.openingQty}
                  onChange={(v) =>
                    setRow(x.row.warehouseId, {
                      openingQty: v,
                      // رصيد في مستودع ← الصنف متاح فيه
                      ...(v > 0 ? { available: true } : {}),
                    })
                  }
                />
              ),
          },
          {
            title: t("OpeningUnit"),
            width: 150,
            render: (_, x) =>
              x.main ? null : (
                <Select
                  style={{ width: "100%" }}
                  options={unitOptions}
                  value={x.row.openingUnitId ?? baseUnitId ?? undefined}
                  onChange={(v) =>
                    setRow(x.row.warehouseId, {
                      openingUnitId: v === baseUnitId ? null : v,
                    })
                  }
                />
              ),
          },
        ]),
  ];

  return (
    <div>
      <Flex
        align="center"
        justify="space-between"
        wrap
        gap={8}
        className="mb-2"
      >
        <Tooltip title={all ? t("WarehousesHint") : t("OwnBranchOnlyHint")}>
          <b>
            {t("WarehousesSection")}{" "}
            <QuestionCircleOutlined style={{ color: C.muted }} />
          </b>
        </Tooltip>
        {all && (
          <Form.Item
            name="allWarehouses"
            label={t("AllWarehouses")}
            tooltip={t("AllWarehousesHint")}
            valuePropName="checked"
            layout="horizontal"
            className="mb-0"
          >
            <Switch size="small" />
          </Form.Item>
        )}
      </Flex>
      {/* القيمة نفسها (الجدول بيعدّلها) */}
      <Form.Item name="stores" hidden>
        <ValueHolder />
      </Form.Item>
      <Table
        size="small"
        rowKey="key"
        pagination={false}
        dataSource={data}
        columns={columns}
        scroll={{ x: 520, y: 220 }}
      />
    </div>
  );
}
