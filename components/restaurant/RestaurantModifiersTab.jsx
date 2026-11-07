"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Tag,
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { useCan } from "@/components/auth/AuthProvider";
import {
  createRestaurantGroupAction,
  createRestaurantModifierAction,
  deleteRestaurantGroupAction,
  deleteRestaurantModifierAction,
  updateRestaurantGroupAction,
  updateRestaurantModifierAction,
} from "@/actions/restaurant.actions";
import { C } from "@/lib/theme";
import EntityModal from "./EntityModal";

// ============================================================
// الإضافات: مجموعات (طريقة الطهي، الصوصات، الإضافات...) وكل إضافة بسعرها
// - الحد الأدنى: 0 اختياري، 1+ إجباري (طريقة الطهي لازم يختار واحدة)
// - الحد الأقصى: 0 بدون حد، 1 = اختيار واحد بس
// - المجموعة بتتربط بالأصناف من تاب المنيو
// ============================================================
export default function RestaurantModifiersTab({ groups }) {
  const t = useTranslations("Restaurant");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const can = useCan();
  const canManage = can("restaurant.manage");
  const { amount: money } = useCurrency();
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  // { kind: "group" | "modifier", row: {} جديد | السطر }
  const [editing, setEditing] = useState(null);

  const remove = async (kind, r) => {
    const res =
      kind === "group"
        ? await deleteRestaurantGroupAction(r.id)
        : await deleteRestaurantModifierAction(r.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Deleted"));
  };

  const iconBtn = (label, icon, onClick, danger) => (
    <Button
      size="small"
      type="text"
      danger={danger}
      icon={icon}
      aria-label={label}
      title={label}
      onClick={onClick}
    />
  );
  const nextOrder = (list) =>
    list.reduce((m, x) => Math.max(m, x.sortOrder), 0) + 1;

  // وصف الاختيار: إجباري واحد، اختياري لحد 3...
  const rule = (g) => {
    if (g.minSelect > 0 && g.maxSelect === g.minSelect)
      return t("RuleExact", { n: g.minSelect });
    const parts = [
      g.minSelect > 0 ? t("RuleMin", { n: g.minSelect }) : t("RuleOptional"),
    ];
    if (g.maxSelect > 0) parts.push(t("RuleMax", { n: g.maxSelect }));
    return parts.join(" · ");
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <span style={{ color: C.muted, fontSize: 13 }}>
          {t("ModifiersHint")}
        </span>
        {canManage && (
          <Space wrap>
            <Button
              icon={<PlusOutlined />}
              onClick={() =>
                setEditing({
                  kind: "group",
                  row: { sortOrder: nextOrder(groups) },
                })
              }
            >
              {t("NewGroup")}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!groups.length}
              onClick={() =>
                setEditing({
                  kind: "modifier",
                  row: { groupId: groups[0]?.id },
                })
              }
            >
              {t("NewModifier")}
            </Button>
          </Space>
        )}
      </div>

      {groups.length ? (
        <div className="settings-masonry">
          {groups.map((g) => (
            <Card
              key={g.id}
              size="small"
              className="mb-4"
              style={g.isActive ? undefined : { opacity: 0.6 }}
              title={
                <Space size={6} wrap>
                  <span>{nm(g)}</span>
                  <Tag color={g.minSelect > 0 ? "orange" : undefined}>
                    {rule(g)}
                  </Tag>
                  {!g.isActive && <Tag>{t("Inactive")}</Tag>}
                </Space>
              }
              extra={
                canManage && (
                  <Space size={0}>
                    {iconBtn(t("AddToGroup"), <PlusOutlined />, () =>
                      setEditing({
                        kind: "modifier",
                        row: {
                          groupId: g.id,
                          sortOrder: nextOrder(g.modifiers),
                        },
                      }),
                    )}
                    {iconBtn(tButtons("Edit"), <EditOutlined />, () =>
                      setEditing({ kind: "group", row: g }),
                    )}
                    <Popconfirm
                      title={t("ConfirmDeleteGroup")}
                      okButtonProps={{ danger: true }}
                      onConfirm={() => remove("group", g)}
                    >
                      {iconBtn(
                        tButtons("Delete"),
                        <DeleteOutlined />,
                        null,
                        true,
                      )}
                    </Popconfirm>
                  </Space>
                )
              }
            >
              {g.modifiers.length ? (
                g.modifiers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2"
                    style={{
                      padding: "6px 2px",
                      borderBottom: `1px solid ${C.border}`,
                      opacity: m.isActive ? 1 : 0.55,
                    }}
                  >
                    <span>
                      {nm(m)}
                      {!m.isActive && (
                        <Tag className="ms-2" style={{ fontSize: 11 }}>
                          {t("Inactive")}
                        </Tag>
                      )}
                    </span>
                    <Space size={4}>
                      <span
                        style={{
                          color: m.price ? C.text : C.muted,
                          fontWeight: m.price ? 600 : 400,
                        }}
                      >
                        {m.price ? `+${money(m.price)}` : t("Free")}
                      </span>
                      {canManage && (
                        <>
                          {iconBtn(tButtons("Edit"), <EditOutlined />, () =>
                            setEditing({ kind: "modifier", row: m }),
                          )}
                          <Popconfirm
                            title={t("ConfirmDeleteModifier")}
                            okButtonProps={{ danger: true }}
                            onConfirm={() => remove("modifier", m)}
                          >
                            {iconBtn(
                              tButtons("Delete"),
                              <DeleteOutlined />,
                              null,
                              true,
                            )}
                          </Popconfirm>
                        </>
                      )}
                    </Space>
                  </div>
                ))
              ) : (
                <div style={{ color: C.muted, fontSize: 13 }}>
                  {t("NoModifiersInGroup")}
                </div>
              )}
              <div style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
                {t("GroupItemsCount", { n: g.items })}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t("NoGroups")}
        />
      )}

      {editing && (
        <ModifierModal
          kind={editing.kind}
          row={editing.row}
          groups={groups}
          nm={nm}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

// ---------- نافذة المجموعة / الإضافة ----------
function ModifierModal({ kind, row, groups, nm, onClose }) {
  const t = useTranslations("Restaurant");
  const tAlerts = useTranslations("Alerts");
  const isGroup = kind === "group";
  const req = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
  ];
  const title = isGroup
    ? row.id
      ? t("EditGroup")
      : t("NewGroup")
    : row.id
      ? t("EditModifier")
      : t("NewModifier");

  const save = (v) => {
    if (isGroup) {
      const data = {
        ...v,
        minSelect: v.minSelect ?? 0,
        maxSelect: v.maxSelect ?? 0,
      };
      return row.id
        ? updateRestaurantGroupAction({ ...data, id: row.id })
        : createRestaurantGroupAction(data);
    }
    const data = { ...v, price: v.price ?? 0 };
    return row.id
      ? updateRestaurantModifierAction({ ...data, id: row.id })
      : createRestaurantModifierAction(data);
  };

  const num = (name, label, hint, props = {}) => (
    <Col xs={12} md={8}>
      <Form.Item name={name} label={label} tooltip={hint}>
        <InputNumber
          min={0}
          precision={0}
          style={{ width: "100%" }}
          {...props}
        />
      </Form.Item>
    </Col>
  );

  return (
    <EntityModal
      width={620}
      title={title}
      initialValues={{
        arName: row.arName ?? "",
        enName: row.enName ?? "",
        sortOrder: row.sortOrder ?? 0,
        isActive: row.isActive ?? true,
        ...(isGroup
          ? { minSelect: row.minSelect ?? 0, maxSelect: row.maxSelect ?? 0 }
          : { groupId: row.groupId, price: row.price ?? 0 }),
      }}
      save={save}
      onClose={onClose}
    >
      <Row gutter={12}>
        <Col xs={24} md={12}>
          <Form.Item name="arName" label={t("ArName")} rules={req}>
            <Input autoComplete="off" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="enName" label={t("EnName")} rules={req}>
            <Input dir="ltr" autoComplete="off" />
          </Form.Item>
        </Col>
        {isGroup ? (
          <>
            {num("minSelect", t("MinSelect"), t("MinSelectHint"), { max: 50 })}
            {num("maxSelect", t("MaxSelect"), t("MaxSelectHint"), { max: 50 })}
          </>
        ) : (
          <>
            <Col xs={24} md={8}>
              <Form.Item
                name="groupId"
                label={t("Group")}
                rules={[{ required: true, message: tAlerts("RequiredField") }]}
              >
                <Select
                  options={groups.map((g) => ({ value: g.id, label: nm(g) }))}
                />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item
                name="price"
                label={t("ModifierPrice")}
                tooltip={t("ModifierPriceHint")}
              >
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </>
        )}
        {num("sortOrder", t("SortOrder"), t("SortOrderHint"), { max: 9999 })}
        <Col xs={12} md={8}>
          <Form.Item name="isActive" label={t("Active")} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Col>
      </Row>
    </EntityModal>
  );
}
