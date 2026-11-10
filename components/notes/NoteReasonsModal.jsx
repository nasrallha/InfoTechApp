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
  deleteNoteReasonAction,
  saveNoteReasonAction,
} from "@/actions/note.actions";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";

const blank = (type) => ({
  id: null,
  label: "",
  enLabel: "",
  forCredit: type !== "debit",
  forDebit: type !== "credit",
  isActive: true,
});

// ============================================================
// أسباب الإشعارات (مشتركة بين العملاء والموردين)
// إضافة / تعديل / إيقاف / حذف، وكل سبب يظهر في الدائن أو المدين أو الاتنين
// items / onChange: القائمة الحالية في الشاشة
// type: نوع الإشعار الحالي (السبب الجديد بيتعلّم عليه افتراضياً)
// onPick(reason): السبب الجديد يتكتب في الإشعار على طول (عربي + إنجليزي)
// ============================================================
export default function NoteReasonsModal({
  open,
  onClose,
  items,
  onChange,
  type,
  onPick,
}) {
  const t = useTranslations("Notes");
  const tAlerts = useTranslations("Alerts");
  const tButtons = useTranslations("Buttons");
  const locale = useLocale();
  const [form, setForm] = useState(() => blank(type));
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.label.trim()) return message.error(t("ReasonRequired"));
    if (!form.forCredit && !form.forDebit)
      return message.error(tAlerts("NoteItemTypeRequired"));
    setSaving(true);
    const res = await saveNoteReasonAction({
      ...form,
      enLabel: form.enLabel?.trim() || null,
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    const isNew = !form.id;
    onChange(
      isNew
        ? [...items, res.data]
        : items.map((x) => (x.id === res.data.id ? res.data : x)),
    );
    message.success(t("ReasonSaved"));
    setForm(blank(type));
    if (isNew && (type === "credit" ? res.data.forCredit : res.data.forDebit))
      onPick?.(res.data);
  };

  const toggle = async (r, isActive) => {
    const res = await saveNoteReasonAction({
      ...r,
      enLabel: r.enLabel || null,
      isActive,
    });
    if (!res.success) return showActionError(res, tAlerts, locale);
    onChange(items.map((x) => (x.id === r.id ? res.data : x)));
  };

  const remove = async (r) => {
    const res = await deleteNoteReasonAction(r.id);
    if (!res.success) return showActionError(res, tAlerts, locale);
    onChange(items.filter((x) => x.id !== r.id));
    if (form.id === r.id) setForm(blank(type));
    message.success(t("ReasonDeleted"));
  };

  const columns = [
    { title: t("ReasonAr"), dataIndex: "label", key: "label", ellipsis: true },
    {
      title: t("ReasonEn"),
      dataIndex: "enLabel",
      key: "enLabel",
      ellipsis: true,
      render: (v) => <bdi>{v || "—"}</bdi>,
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
            title={t("ReasonDeleteTitle")}
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
      width={900}
      destroyOnHidden
      title={t("ManageReasons")}
    >
      <p className="muted mb-3">{t("ManageReasonsHint")}</p>
      <Row gutter={[12, 12]} align="bottom" className="mb-3">
        <Col xs={24} md={8}>
          <div className="mb-1">
            {t("ReasonAr")} <span className="text-red-500">*</span>
          </div>
          <Input
            maxLength={500}
            value={form.label}
            onChange={(e) => set({ label: e.target.value })}
            onPressEnter={save}
          />
        </Col>
        <Col xs={24} md={7}>
          <div className="mb-1">{t("ReasonEn")}</div>
          <Input
            dir="ltr"
            maxLength={500}
            value={form.enLabel ?? ""}
            onChange={(e) => set({ enLabel: e.target.value })}
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
        scroll={{ x: 760, y: 320 }}
        locale={{ emptyText: t("NoReasons") }}
      />
    </Modal>
  );
}
