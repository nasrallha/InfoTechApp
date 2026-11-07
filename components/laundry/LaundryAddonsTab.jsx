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
  Modal,
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
import { applyFieldErrors } from "@/lib/form-errors";
import { useCan } from "@/components/auth/AuthProvider";
import {
  createLaundryAddonAction,
  createLaundryAddonGroupAction,
  deleteLaundryAddonAction,
  deleteLaundryAddonGroupAction,
  updateLaundryAddonAction,
  updateLaundryAddonGroupAction,
} from "@/actions/laundry.actions";
import { C } from "@/lib/theme";

// ============================================================
// إضافات المغسلة (من غير أسعار): تعليمات بتتسجل على القطعة
// - المجموعة: النشا، المرزام، إضافات أخرى...
//   multiple = يختار أكتر من واحدة، غير كده واحدة بس (نشا خفيف أو وسط أو ثقيل)
// - كل مجموعة كارت، وجواها إضافاتها
// ============================================================
export default function LaundryAddonsTab({ groups }) {
  const t = useTranslations("Laundry");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const can = useCan();
  const canManage = can("laundry.manage");
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  // { kind: "group" | "addon", row: {} جديد | السطر }
  const [editing, setEditing] = useState(null);

  const remove = async (kind, r) => {
    const res =
      kind === "group"
        ? await deleteLaundryAddonGroupAction(r.id)
        : await deleteLaundryAddonAction(r.id);
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

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <span style={{ color: C.muted, fontSize: 13 }}>{t("AddonsHint")}</span>
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
                setEditing({ kind: "addon", row: { groupId: groups[0]?.id } })
              }
            >
              {t("NewAddon")}
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
                  <Tag>
                    {g.multiple ? t("Multiple") : t("Single")}
                  </Tag>
                  {!g.isActive && <Tag>{t("Inactive")}</Tag>}
                </Space>
              }
              extra={
                canManage && (
                  <Space size={0}>
                    {iconBtn(t("AddToGroup"), <PlusOutlined />, () =>
                      setEditing({
                        kind: "addon",
                        row: { groupId: g.id, sortOrder: nextOrder(g.addons) },
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
                      {iconBtn(tButtons("Delete"), <DeleteOutlined />, null, true)}
                    </Popconfirm>
                  </Space>
                )
              }
            >
              {g.addons.length ? (
                g.addons.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2"
                    style={{
                      padding: "6px 2px",
                      borderBottom: `1px solid ${C.border}`,
                      opacity: a.isActive ? 1 : 0.55,
                    }}
                  >
                    <span>
                      {nm(a)}
                      {!a.isActive && (
                        <Tag className="ms-2" style={{ fontSize: 11 }}>
                          {t("Inactive")}
                        </Tag>
                      )}
                    </span>
                    {canManage && (
                      <Space size={0}>
                        {iconBtn(tButtons("Edit"), <EditOutlined />, () =>
                          setEditing({ kind: "addon", row: a }),
                        )}
                        <Popconfirm
                          title={t("ConfirmDeleteAddon")}
                          okButtonProps={{ danger: true }}
                          onConfirm={() => remove("addon", a)}
                        >
                          {iconBtn(
                            tButtons("Delete"),
                            <DeleteOutlined />,
                            null,
                            true,
                          )}
                        </Popconfirm>
                      </Space>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ color: C.muted, fontSize: 13 }}>
                  {t("NoAddonsInGroup")}
                </div>
              )}
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
        <AddonModal
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
function AddonModal({ kind, row, groups, nm, onClose }) {
  const t = useTranslations("Laundry");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isGroup = kind === "group";
  const req = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
  ];

  const save = async (v) => {
    setSaving(true);
    const res = isGroup
      ? row.id
        ? await updateLaundryAddonGroupAction({ ...v, id: row.id })
        : await createLaundryAddonGroupAction(v)
      : row.id
        ? await updateLaundryAddonAction({ ...v, id: row.id })
        : await createLaundryAddonAction(v);
    setSaving(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("Saved"));
    onClose();
  };

  const title = isGroup
    ? row.id
      ? t("EditGroup")
      : t("NewGroup")
    : row.id
      ? t("EditAddon")
      : t("NewAddon");

  return (
    <Modal
      open
      width={560}
      title={title}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Form
        form={form}
        preserve={false}
        layout="vertical"
        autoComplete="off"
        onFinish={save}
        initialValues={{
          arName: row.arName ?? "",
          enName: row.enName ?? "",
          sortOrder: row.sortOrder ?? 0,
          isActive: row.isActive ?? true,
          ...(isGroup
            ? { multiple: row.multiple ?? false }
            : { groupId: row.groupId }),
        }}
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
            <Col xs={12} md={8}>
              <Form.Item
                name="multiple"
                label={t("Multiple")}
                tooltip={t("MultipleHint")}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          ) : (
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
          )}
          <Col xs={12} md={8}>
            <Form.Item
              name="sortOrder"
              label={t("SortOrder")}
              tooltip={t("SortOrderHint")}
            >
              <InputNumber
                min={0}
                max={9999}
                precision={0}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="isActive"
              label={t("Status")}
              tooltip={t("InactiveHint")}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
