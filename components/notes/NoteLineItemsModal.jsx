"use client";

import { useState } from "react";
import {
  Button,
  Col,
  Input,
  Modal,
  Popconfirm,
  Row,
  Switch,
  Table,
  Tag,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import {
  deleteNoteLineItemAction,
  saveNoteLineItemAction,
} from "@/actions/note.actions";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";

const blank = (type) => ({
  id: null,
  arName: "",
  enName: "",
  forCredit: type !== "debit",
  forDebit: type !== "credit",
  isActive: true,
});

// ============================================================
// بنود الإشعارات المضافة من المستخدم (مشتركة بين العملاء والموردين)
// - إضافة بند جديد (ويتضاف سطر بيه في الإشعار على طول: onAdded)
// - تعديل / إيقاف / حذف (الحذف ممنوع لو البند مستخدم: يتوقف بدله)
// items / onChange: القائمة الحالية في الشاشة
// type: نوع الإشعار الحالي (البند الجديد بيتعلّم عليه افتراضياً)
// ============================================================
export default function NoteLineItemsModal({
  open,
  onClose,
  items,
  onChange,
  type,
  onAdded,
}) {
  const t = useTranslations("Notes");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const [form, setForm] = useState(() => blank(type));
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.arName.trim()) return message.error(t("ItemNameRequired"));
    if (!form.forCredit && !form.forDebit)
      return message.error(tAlerts("NoteItemTypeRequired"));
    setSaving(true);
    const res = await saveNoteLineItemAction(form);
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    const item = res.data;
    const isNew = !form.id;
    onChange(
      isNew
        ? [...items, item]
        : items.map((x) => (x.id === item.id ? item : x)),
    );
    message.success(t("ItemSaved"));
    setForm(blank(type));
    // بند جديد ومتاح في النوع الحالي ← سطر بيه في الإشعار
    if (isNew && (type === "credit" ? item.forCredit : item.forDebit))
      onAdded?.(item);
  };

  const toggle = async (item, isActive) => {
    const res = await saveNoteLineItemAction({ ...item, isActive });
    if (!res.success) return showActionError(res, tAlerts, locale);
    onChange(items.map((x) => (x.id === item.id ? res.data : x)));
  };

  const remove = async (item) => {
    const res = await deleteNoteLineItemAction(item.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    onChange(items.filter((x) => x.id !== item.id));
    if (form.id === item.id) setForm(blank(type));
    message.success(t("ItemDeleted"));
  };

  const columns = [
    {
      title: t("ItemArName"),
      dataIndex: "arName",
      key: "ar",
      ellipsis: true,
    },
    {
      title: t("ItemEnName"),
      dataIndex: "enName",
      key: "en",
      ellipsis: true,
    },
    {
      title: t("ShowsIn"),
      key: "types",
      width: 170,
      render: (_, r) => (
        <>
          {r.forCredit && <Tag className="cp-chip">{t("type.credit")}</Tag>}
          {r.forDebit && <Tag className="cp-chip">{t("type.debit")}</Tag>}
        </>
      ),
    },
    {
      title: t("Active"),
      key: "active",
      width: 80,
      align: "center",
      render: (_, r) => (
        <Switch
          size="small"
          checked={r.isActive}
          onChange={(v) => toggle(r, v)}
        />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 90,
      align: "center",
      render: (_, r) => (
        <>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label={tButtons("Edit")}
            onClick={() => setForm({ ...r })}
          />
          <Popconfirm
            title={t("ItemDeleteTitle")}
            description={t("ItemDeleteHint")}
            okButtonProps={{ danger: true }}
            onConfirm={() => remove(r)}
          >
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              aria-label={tButtons("Delete")}
            />
          </Popconfirm>
        </>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={820}
      destroyOnHidden
      title={t("ManageItems")}
    >
      <p className="muted mb-3">{t("ManageItemsHint")}</p>
      <Row gutter={[12, 12]} align="bottom" className="mb-3">
        <Col xs={24} md={8}>
          <div className="mb-1">
            {t("ItemArName")} <span className="text-red-500">*</span>
          </div>
          <Input
            maxLength={100}
            value={form.arName}
            onChange={(e) => set({ arName: e.target.value })}
            onPressEnter={save}
          />
        </Col>
        <Col xs={24} md={7}>
          <div className="mb-1">{t("ItemEnName")}</div>
          <Input
            maxLength={100}
            dir="ltr"
            value={form.enName}
            onChange={(e) => set({ enName: e.target.value })}
            onPressEnter={save}
          />
        </Col>
        <Col xs={12} md={3}>
          <div className="mb-1">{t("type.credit")}</div>
          <Switch
            checked={form.forCredit}
            onChange={(v) => set({ forCredit: v })}
          />
        </Col>
        <Col xs={12} md={3}>
          <div className="mb-1">{t("type.debit")}</div>
          <Switch
            checked={form.forDebit}
            onChange={(v) => set({ forDebit: v })}
          />
        </Col>
        <Col xs={24} md={3}>
          <Button
            type="primary"
            block
            loading={saving}
            icon={form.id ? <SaveOutlined /> : <PlusOutlined />}
            onClick={save}
          >
            {form.id ? tButtons("Save") : t("AddItem")}
          </Button>
        </Col>
      </Row>
      <Table
        size="small"
        bordered
        rowKey="id"
        columns={columns}
        dataSource={items}
        pagination={false}
        scroll={{ x: 640, y: 320 }}
        locale={{ emptyText: t("NoCustomItems") }}
      />
    </Modal>
  );
}
