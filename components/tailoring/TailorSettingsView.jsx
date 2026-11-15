"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import PageHeader from "@/components/common/PageHeader";
import ClientOnly from "@/components/common/ClientOnly";
import ImageUploadItem from "@/components/common/ImageUploadItem";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { styleImageUrl } from "@/lib/tailoring";
import { cleanDrawing } from "./cleanDrawing";
import LibraryPicker from "./LibraryPicker";
import { THOBE_PARTS } from "@/lib/thobe";

// الشكل على الثوب ← نوع صور المكتبة اللي تتفتح أول مرة
const PART_LIBRARY = {
  preset: "models",
  collar: "collars",
  placket: "plackets",
  cuff: "cuffs",
  pocket: "pockets",
  side: "fronts",
  extra: "pockets",
};
import {
  deleteFieldAction,
  deleteStyleChoiceAction,
  deleteStyleGroupAction,
  saveFieldAction,
  saveStyleChoiceAction,
  saveStyleGroupAction,
  saveTailorSettingsAction,
} from "@/actions/tailoring.actions";
import "./tailoring.css";

// ============================================================
// إعدادات الخياط (التحكم الكامل):
// - خانات المقاسات: تضيف / تعدل / ترتب / توقف
// - تفاصيل التفصيل: مجموعات (الموديل، الرقبة ...) ولكل مجموعة اختيارات بصورها
// - عام: سعر تفصيل الثوب الافتراضي + قسم الأقمشة
// ============================================================
const TABS = ["styles", "fields", "general"];

export default function TailorSettingsView({ data, tab, canManage }) {
  const t = useTranslations("Tailoring");
  const router = useRouter();
  const pathname = usePathname();
  const active = TABS.includes(tab) ? tab : "styles";

  return (
    <div>
      <PageHeader title={t("SettingsTitle")} />
      <Tabs
        activeKey={active}
        onChange={(k) => router.replace(`${pathname}?tab=${k}`)}
        items={[
          {
            key: "styles",
            label: t("Styles"),
            children: <StylesTab data={data} canManage={canManage} />,
          },
          {
            key: "fields",
            label: t("MeasureFields"),
            children: <FieldsTab data={data} canManage={canManage} />,
          },
          {
            key: "general",
            label: t("General"),
            children: <GeneralTab data={data} canManage={canManage} />,
          },
        ]}
      />
    </div>
  );
}

// نافذة سجل بسيطة (إضافة / تعديل) - الحفظ والأخطاء
function useEditor(saveAction, toForm) {
  const tAlerts = useTranslations("Alerts");
  const t = useTranslations("Tailoring");
  const locale = useLocale();
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const open = (row, extra = {}) => {
    setEditing({ ...(row ?? {}), ...extra });
    form.resetFields();
    form.setFieldsValue(toForm(row ?? null));
  };
  const save = async (payload) => {
    setSaving(true);
    const res = await saveAction(payload);
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Saved"));
    setEditing(null);
  };
  return { form, editing, saving, open, close: () => setEditing(null), save };
}

async function removeWith(action, id, t, tAlerts, locale) {
  const res = await action(id);
  if (!res.success) return showActionError(res, tAlerts, locale);
  message.success(t("Deleted"));
}

// ---------------- خانات المقاسات ----------------
function FieldsTab({ data, canManage }) {
  const t = useTranslations("Tailoring");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName || x.arName);
  const ed = useEditor(saveFieldAction, (r) => ({
    arName: r?.arName ?? "",
    enName: r?.enName ?? "",
    sortOrder: r?.sortOrder ?? data.fields.length + 1,
    isActive: r?.isActive ?? true,
  }));

  return (
    <div>
      {canManage && (
        <div className="flex justify-end mb-3">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => ed.open(null)}
          >
            {t("NewField")}
          </Button>
        </div>
      )}
      <Table
        bordered
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={data.fields}
        scroll={{ x: 560 }}
        columns={[
          {
            title: t("SortOrder"),
            dataIndex: "sortOrder",
            width: 80,
            align: "center",
          },
          { title: t("FieldName"), key: "n", render: (_, r) => nameOf(r) },
          {
            title: t("Status"),
            key: "s",
            width: 100,
            align: "center",
            render: (_, r) =>
              r.isActive ? (
                <Tag color="green">{t("Active")}</Tag>
              ) : (
                <Tag>{t("Inactive")}</Tag>
              ),
          },
          ...(canManage
            ? [
                {
                  title: "",
                  key: "a",
                  width: 100,
                  align: "center",
                  render: (_, r) => (
                    <Space>
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => ed.open(r)}
                      />
                      <Popconfirm
                        title={t("DeleteConfirm")}
                        description={t("DeleteFieldHint")}
                        onConfirm={() =>
                          removeWith(
                            deleteFieldAction,
                            r.id,
                            t,
                            tAlerts,
                            locale,
                          )
                        }
                      >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <ClientOnly>
        <Modal
          open={Boolean(ed.editing)}
          title={ed.editing?.id ? t("EditField") : t("NewField")}
          onCancel={ed.close}
          onOk={() => ed.form.submit()}
          confirmLoading={ed.saving}
          width={560}
          forceRender
        >
          <Form
            form={ed.form}
            layout="vertical"
            autoComplete="off"
            className="compact-modal-form"
            onFinish={(v) =>
              ed.save({
                ...v,
                ...(ed.editing?.id ? { id: ed.editing.id } : {}),
              })
            }
          >
            <NameSortActive t={t} tAlerts={tAlerts} />
          </Form>
        </Modal>
      </ClientOnly>
    </div>
  );
}

// الاسم عربي / إنجليزي + الترتيب + مفعّل (مشتركة)
function NameSortActive({ t, tAlerts, extra = null }) {
  const req = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
  ];
  return (
    <Row gutter={[12, 0]}>
      <Col xs={24} sm={9}>
        <Form.Item name="arName" label={t("ArName")} rules={req}>
          <Input maxLength={60} />
        </Form.Item>
      </Col>
      <Col xs={24} sm={9}>
        <Form.Item name="enName" label={t("EnName")} rules={req}>
          <Input maxLength={60} dir="ltr" />
        </Form.Item>
      </Col>
      <Col xs={12} sm={3}>
        <Form.Item name="sortOrder" label={t("SortOrder")}>
          <InputNumber
            min={0}
            max={9999}
            precision={0}
            style={{ width: "100%" }}
          />
        </Form.Item>
      </Col>
      <Col xs={12} sm={3}>
        <Form.Item name="isActive" label={t("Active")} valuePropName="checked">
          <Switch />
        </Form.Item>
      </Col>
      {extra}
    </Row>
  );
}

// ---------------- تفاصيل التفصيل (المجموعات والاختيارات بالصور) ----------------
function StylesTab({ data, canManage }) {
  const t = useTranslations("Tailoring");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName || x.arName);
  const group = useEditor(saveStyleGroupAction, (r) => ({
    arName: r?.arName ?? "",
    enName: r?.enName ?? "",
    multiple: r?.multiple ?? false,
    sortOrder: r?.sortOrder ?? data.groups.length + 1,
    isActive: r?.isActive ?? true,
  }));
  const choice = useEditor(saveStyleChoiceAction, (r) => ({
    arName: r?.arName ?? "",
    enName: r?.enName ?? "",
    sortOrder: r?.sortOrder ?? 0,
    isActive: r?.isActive ?? true,
    // تنظيف الرسمة (خلفية بيضا + شيل الفراغ) قبل الرفع
    clean: true,
    part: r?.part ?? undefined,
    // صورة من المكتبة (بدل الرفع)
    libraryImage: null,
    image: r?.image
      ? [
          {
            uid: "-1",
            name: r.image.split("/").pop(),
            status: "done",
            url: styleImageUrl(r.image),
          },
        ]
      : [],
  }));

  const partKind = Form.useWatch("part", choice.form);
  // الاختيار بصورة ← FormData
  const saveChoice = async (v) => {
    const fd = new FormData();
    if (choice.editing?.id) fd.append("id", choice.editing.id);
    fd.append("groupId", choice.editing.groupId);
    fd.append("arName", v.arName);
    fd.append("enName", v.enName);
    fd.append("sortOrder", String(v.sortOrder ?? 0));
    fd.append("isActive", String(v.isActive));
    fd.append("part", v.part ?? "");
    let file = v.image?.[0]?.originFileObj;
    // صورة رسمة على ورق ← نفس تنظيف رسومات الكارت (لو فشل: الصورة زي ما هي)
    if (file && v.clean) file = await cleanDrawing(file).catch(() => file);
    if (file) fd.append("image", file);
    // صورة من المكتبة
    else if (v.libraryImage) fd.append("libraryImage", v.libraryImage);
    else if (choice.editing?.image && !v.image?.length)
      fd.append("removeImage", "true");
    return choice.save(fd);
  };

  return (
    <div>
      {canManage && (
        <div className="flex justify-end mb-3">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => group.open(null)}
          >
            {t("NewGroup")}
          </Button>
        </div>
      )}
      {data.groups.map((g) => (
        <Card
          key={g.id}
          size="small"
          className="mb-3"
          title={
            <Space wrap>
              <b>{nameOf(g)}</b>
              {g.multiple && (
                <Tag className="cp-chip">{t("MultipleChoice")}</Tag>
              )}
              {!g.isActive && <Tag>{t("Inactive")}</Tag>}
            </Space>
          }
          extra={
            canManage && (
              <Space>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => choice.open(null, { groupId: g.id })}
                >
                  {t("NewChoice")}
                </Button>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => group.open(g)}
                />
                <Popconfirm
                  title={t("DeleteGroupConfirm")}
                  description={t("DeleteGroupHint")}
                  onConfirm={() =>
                    removeWith(deleteStyleGroupAction, g.id, t, tAlerts, locale)
                  }
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            )
          }
        >
          {!g.choices.length ? (
            <span className="text-slate-500">{t("NoChoices")}</span>
          ) : (
            <div className="tailor-styles__choices">
              {g.choices.map((c) => (
                <div
                  key={c.id}
                  className="tailor-choice"
                  style={{ cursor: "default", opacity: c.isActive ? 1 : 0.5 }}
                >
                  {c.image ? (
                    <img
                      src={styleImageUrl(c.image)}
                      alt=""
                      className="tailor-choice__img"
                    />
                  ) : (
                    <span className="tailor-choice__img tailor-choice__img--empty" />
                  )}
                  <span className="tailor-choice__name">{nameOf(c)}</span>
                  {canManage && (
                    <Space size={4}>
                      <Button
                        size="small"
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => choice.open(c, { groupId: g.id })}
                      />
                      <Popconfirm
                        title={t("DeleteConfirm")}
                        onConfirm={() =>
                          removeWith(
                            deleteStyleChoiceAction,
                            c.id,
                            t,
                            tAlerts,
                            locale,
                          )
                        }
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                        />
                      </Popconfirm>
                    </Space>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}

      <ClientOnly>
        <Modal
          open={Boolean(group.editing)}
          title={group.editing?.id ? t("EditGroup") : t("NewGroup")}
          onCancel={group.close}
          onOk={() => group.form.submit()}
          confirmLoading={group.saving}
          width={620}
          forceRender
        >
          <Form
            form={group.form}
            layout="vertical"
            autoComplete="off"
            className="compact-modal-form"
            onFinish={(v) =>
              group.save({
                ...v,
                ...(group.editing?.id ? { id: group.editing.id } : {}),
              })
            }
          >
            <NameSortActive
              t={t}
              tAlerts={tAlerts}
              extra={
                <Col xs={24}>
                  <Form.Item
                    name="multiple"
                    label={t("MultipleChoice")}
                    tooltip={t("MultipleHint")}
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                </Col>
              }
            />
          </Form>
        </Modal>

        <Modal
          open={Boolean(choice.editing)}
          title={choice.editing?.id ? t("EditChoice") : t("NewChoice")}
          onCancel={choice.close}
          onOk={() => choice.form.submit()}
          confirmLoading={choice.saving}
          width={620}
          forceRender
        >
          <Form
            form={choice.form}
            layout="vertical"
            autoComplete="off"
            className="compact-modal-form"
            onFinish={saveChoice}
          >
            <NameSortActive
              t={t}
              tAlerts={tAlerts}
              extra={
                <>
                  <Col xs={24} sm={14}>
                    <ImageUploadItem
                      name="image"
                      label={t("ChoiceImage")}
                      card
                    />
                  </Col>
                  <Col xs={24} sm={10}>
                    <Form.Item name="libraryImage" label={t("OrFromLibrary")}>
                      <LibraryPicker
                        category={
                          PART_LIBRARY[String(partKind ?? "").split(":")[0]]
                        }
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={14}>
                    <Form.Item
                      name="part"
                      label={t("PartOnThobe")}
                      tooltip={t("PartOnThobeHint")}
                    >
                      <Select
                        allowClear
                        placeholder={t("PartNone")}
                        options={Object.entries(THOBE_PARTS).map(
                          ([kind, shapes]) => ({
                            label: t(`pg_${kind}`),
                            options: shapes.map((sh) => ({
                              value: `${kind}:${sh}`,
                              label: t(`part_${kind}_${sh}`),
                            })),
                          }),
                        )}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={10}>
                    <Form.Item
                      name="clean"
                      label={t("CleanDrawing")}
                      tooltip={t("CleanDrawingHint")}
                      valuePropName="checked"
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                  <Col xs={24}>
                    <Alert type="info" showIcon title={t("AddDrawingHint")} />
                  </Col>
                </>
              }
            />
          </Form>
        </Modal>
      </ClientOnly>
    </div>
  );
}

// ---------------- عام: سعر التفصيل وقسم الأقمشة ----------------
function GeneralTab({ data, canManage }) {
  const t = useTranslations("Tailoring");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nameOf = (x) => (locale === "ar" ? x.arName : x.enName || x.arName);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const save = async (v) => {
    setSaving(true);
    const res = await saveTailorSettingsAction({
      sewPrice: v.sewPrice ?? 0,
      deliveryDays: v.deliveryDays ?? 7,
      fabricCategoryId: v.fabricCategoryId ?? null,
    });
    setSaving(false);
    if (!res.success) return showActionError(res, tAlerts, locale);
    message.success(t("Saved"));
  };

  return (
    <Card size="small">
      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
        className="cp-compact-form"
        disabled={!canManage}
        initialValues={data.settings}
        onFinish={save}
      >
        <Row gutter={[12, 0]}>
          <Col xs={24} sm={12} md={6}>
            <Form.Item
              name="sewPrice"
              label={t("DefaultSewPrice")}
              tooltip={t("DefaultSewPriceHint")}
            >
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item
              name="deliveryDays"
              label={t("DeliveryDays")}
              tooltip={t("DeliveryDaysHint")}
            >
              <InputNumber
                min={0}
                max={365}
                precision={0}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item
              name="fabricCategoryId"
              label={t("FabricCategory")}
              tooltip={t("FabricCategoryHint")}
            >
              <Select
                allowClear
                placeholder={t("AllProducts")}
                showSearch={{ optionFilterProp: "label" }}
                options={data.categories.map((c) => ({
                  value: c.id,
                  label: nameOf(c),
                }))}
              />
            </Form.Item>
          </Col>
        </Row>
        {canManage && (
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={saving}
          >
            {t("Save")}
          </Button>
        )}
      </Form>
    </Card>
  );
}
