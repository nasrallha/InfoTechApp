"use client";

import { useEffect, useMemo, useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Checkbox,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
} from "antd";
import { useLocale, useTranslations } from "next-intl";
import { message } from "@/components/common/feedback";
import { showActionError } from "@/components/common/actionError";
import { useCurrency } from "@/components/common/CurrencyProvider";
import ImageUploadItem from "@/components/common/ImageUploadItem";
import { applyFieldErrors } from "@/lib/form-errors";
import { imageUrl } from "@/lib/image";
import { saveMenuItemAction } from "@/actions/restaurant.actions";
import { nextProductCodeAction } from "@/actions/product.actions";
import { createCategoryAction } from "@/actions/category.actions";
import { useCan } from "@/components/auth/AuthProvider";
import { C } from "@/lib/theme";

const round2 = (v) => Math.round(Number(v) * 100) / 100;

// سعر الصنف في التطبيق من غير سعر خاص: السعر + الزيادة (نسبة أو مبلغ)
export function channelDefaultPrice(price, ch) {
  const v = Number(ch.markupValue) || 0;
  return round2(
    ch.markupType === "percent" ? price * (1 + v / 100) : Number(price) + v,
  );
}

// عنوان قسم جوه النافذة
function Section({ title, hint, children }) {
  return (
    <div className="rest-section">
      <div className="rest-section__title">
        <span>{title}</span>
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  );
}

// ============================================================
// صنف المنيو (جديد أو تعديل) من شاشة المطعم مرة واحدة:
// - البيانات: الاسم عربي وإنجليزي، القسم، السعر، الصورة، الكود (فاضي = تلقائي)
// - الأحجام: علّم الحجم المتاح واكتب سعره (من غير أحجام = سعر الصنف)
// - الإضافات: المجموعات اللي بتظهر مع الصنف
// - رسوم التبغ + أسعار التطبيقات (الفاضي = السعر + زيادة التطبيق)
// item: null = صنف جديد
// ============================================================
export default function RestaurantItemModal({ item, catalog, onClose }) {
  const t = useTranslations("Restaurant");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const isNew = !item;
  const [form] = Form.useForm();
  // الصنف الجديد: الكود الجاي بيتكتب في الخانة (ويتغيّر عادي)
  useEffect(() => {
    if (!isNew) return;
    let alive = true;
    nextProductCodeAction().then((res) => {
      if (alive && res.success && !form.getFieldValue("code"))
        form.setFieldValue("code", res.data);
    });
    return () => {
      alive = false;
    };
  }, [isNew, form]);
  const price = Form.useWatch("price", form) ?? item?.product.price ?? 0;

  // الأحجام: المفعّلة + الموقوفة اللي عليها سعر للصنف ده
  const sizeList = catalog.sizes.filter(
    (s) => s.isActive || item?.sizes.some((x) => x.sizeId === s.id),
  );
  const groupList = catalog.groups.filter(
    (g) => g.isActive || item?.groupIds.includes(g.id),
  );
  const channels = catalog.channels.filter(
    (c) => c.isActive || item?.channelPrices.some((p) => p.channelId === c.id),
  );

  // { [sizeId]: price } للأحجام المتاحة
  const [sizes, setSizes] = useState(() =>
    Object.fromEntries((item?.sizes ?? []).map((s) => [s.sizeId, s.price])),
  );
  const [groupIds, setGroupIds] = useState(item?.groupIds ?? []);
  // { "channelId:sizeId": price }
  const [prices, setPrices] = useState(() =>
    Object.fromEntries(
      (item?.channelPrices ?? []).map((p) => [
        `${p.channelId}:${p.sizeId}`,
        p.price,
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  // الأقسام: اللي جاية من الشاشة + اللي اتضافت من هنا
  const [categories, setCategories] = useState(catalog.categories);
  const [newCat, setNewCat] = useState(false);
  const can = useCan();

  const activeSizes = sizeList.filter((s) => sizes[s.id] !== undefined);
  // أعمدة جدول التطبيقات: الأحجام المتاحة، أو الصنف نفسه (حجم 0)
  const priceCols = activeSizes.length
    ? activeSizes.map((s) => ({
        sizeId: s.id,
        label: nm(s),
        price: Number(sizes[s.id]) || 0,
      }))
    : [{ sizeId: 0, label: t("Price"), price: Number(price) || 0 }];

  const toggleSize = (id, on) =>
    setSizes((m) => {
      const next = { ...m };
      if (on) next[id] = next[id] ?? (Number(price) || 0);
      else delete next[id];
      return next;
    });

  const groupOptions = useMemo(
    () =>
      groupList.map((g) => ({
        value: g.id,
        label: `${nm(g)} (${g.modifiers.length})`,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupList, locale],
  );

  const submit = async (v) => {
    const sizeRows = activeSizes.map((s) => ({
      sizeId: s.id,
      price: Number(sizes[s.id]) || 0,
    }));
    const valid = new Set(priceCols.map((r) => r.sizeId));
    const channelPrices = Object.entries(prices)
      .filter(([, x]) => x !== null && x !== undefined && x !== "")
      .map(([k, x]) => {
        const [channelId, sizeId] = k.split(":").map(Number);
        return { channelId, sizeId, price: Number(x) };
      })
      .filter((p) => valid.has(p.sizeId));
    const file = v.image?.[0];
    const fd = new FormData();
    if (file?.originFileObj) fd.set("image", file.originFileObj);
    fd.set(
      "payload",
      JSON.stringify({
        productId: item?.productId ?? null,
        code: v.code || null,
        arName: v.arName,
        enName: v.enName,
        categoryId: v.categoryId ?? null,
        price: v.price ?? 0,
        isActive: Boolean(v.isActive),
        removeImage: !isNew && Boolean(item.product.image) && !file,
        sortOrder: v.sortOrder ?? 0,
        isTobacco: Boolean(v.isTobacco),
        askPieces: Boolean(v.askPieces),
        priceIncludesTax: Boolean(v.priceIncludesTax),
        sizes: sizeRows,
        groupIds,
        channelPrices,
      }),
    );
    setSaving(true);
    const res = await saveMenuItemAction(fd);
    setSaving(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("Saved"));
    onClose();
  };

  const req = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
  ];

  return (
    <Modal
      open
      width={1000}
      className="rest-item-modal"
      title={isNew ? t("NewItem") : `${t("EditItem")}: ${nm(item.product)}`}
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
        onFinish={submit}
        initialValues={{
          arName: item?.product.arName ?? "",
          enName: item?.product.enName ?? "",
          categoryId: item?.product.categoryId ?? undefined,
          code: item?.product.code ?? "",
          price: item?.product.price ?? 0,
          sortOrder: item?.sortOrder ?? 0,
          isActive: item?.product.isActive ?? true,
          isTobacco: item?.isTobacco ?? false,
          askPieces: item?.askPieces ?? false,
          // شامل الضريبة: زي الصنف، والجديد من إعدادات البرنامج
          priceIncludesTax: item
            ? Boolean(item.product.isPriceIncludeTax)
            : catalog.priceIncludesTaxDefault,
          image: item?.product.image
            ? [
                {
                  uid: "-1",
                  name: "image",
                  status: "done",
                  url: imageUrl(item.product.image),
                },
              ]
            : [],
        }}
      >
        <Section title={t("ItemData")}>
          <div className="rest-item-data">
            {/* الصورة: مربع صغير على الجنب */}
            <div className="rest-item-data__img">
              <ImageUploadItem name="image" card />
            </div>
            <Row gutter={10} className="rest-item-data__fields">
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="arName" label={t("ArName")} rules={req}>
                  <Input autoComplete="off" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="enName" label={t("EnName")} rules={req}>
                  <Input dir="ltr" autoComplete="off" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={10} md={8}>
                <Form.Item label={t("Category")} tooltip={t("CategoryHint")}>
                  <Space.Compact style={{ width: "100%" }}>
                    <Form.Item name="categoryId" noStyle>
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        style={{ width: "100%" }}
                        options={categories.map((c) => ({
                          value: c.id,
                          label: nm(c),
                        }))}
                      />
                    </Form.Item>
                    {can("categories.create") && (
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        title={t("NewCategory")}
                        aria-label={t("NewCategory")}
                        onClick={() => setNewCat(true)}
                      />
                    )}
                  </Space.Compact>
                </Form.Item>
              </Col>
              <Col xs={12} sm={7} md={4}>
                <Form.Item name="price" label={t("Price")} tooltip={t("PriceHint")}>
                  <InputNumber min={0} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={7} md={4}>
                <Form.Item
                  name="code"
                  label={t("Code")}
                  tooltip={isNew ? t("CodeHint") : undefined}
                >
                  <Input dir="ltr" autoComplete="off" disabled={!isNew} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8} md={4}>
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
              {/* السويتشات جنب بعض */}
              <Col xs={24} sm={16} md={12}>
                <div className="rest-item-switches">
                  <Form.Item name="isActive" valuePropName="checked" noStyle>
                    <Switch />
                  </Form.Item>
                  <span>{t("Active")}</span>
                  <Form.Item name="isTobacco" valuePropName="checked" noStyle>
                    <Switch />
                  </Form.Item>
                  <span
                    title={
                      catalog.settings.tobaccoPercent > 0
                        ? catalog.settings.tobaccoType === "amount"
                          ? t("TobaccoOnAmount", { v: money(catalog.settings.tobaccoPercent) })
                          : t("TobaccoOn", { v: catalog.settings.tobaccoPercent })
                        : t("TobaccoOff")
                    }
                  >
                    {t("Tobacco")}
                  </span>
                  {/* عدد الحبات (السمك...): الكاشير بيكتب الكيلو كام حبة */}
                  <Form.Item name="askPieces" valuePropName="checked" noStyle>
                    <Switch />
                  </Form.Item>
                  <span title={t("AskPiecesHint")}>{t("AskPieces")}</span>
                  {/* السعر شامل الضريبة (زي شاشة الأصناف) */}
                  <Form.Item name="priceIncludesTax" valuePropName="checked" noStyle>
                    <Switch />
                  </Form.Item>
                  <span title={t("PriceIncludesTaxHint")}>{t("PriceIncludesTax")}</span>
                </div>
              </Col>
            </Row>
          </div>
        </Section>
      </Form>

      <div className="rest-item-grid">
      <Section title={t("Sizes")} hint={t("ItemSizesHint")}>
        {sizeList.length ? (
          <div className="rest-sizes">
            {sizeList.map((s) => {
              const on = sizes[s.id] !== undefined;
              return (
                <div
                  key={s.id}
                  className={`rest-size${on ? " is-on" : ""}`}
                >
                  <Checkbox
                    checked={on}
                    onChange={(e) => toggleSize(s.id, e.target.checked)}
                  >
                    <b>{nm(s)}</b>
                  </Checkbox>
                  <InputNumber
                    min={0}
                    disabled={!on}
                    placeholder={t("Price")}
                    value={on ? sizes[s.id] : null}
                    onChange={(v) =>
                      setSizes((m) => ({ ...m, [s.id]: v ?? 0 }))
                    }
                    style={{ width: "100%" }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: C.muted }}>{t("NoSizesDefined")}</div>
        )}
      </Section>

      <Section title={t("Modifiers")} hint={t("ItemModifiersHint")}>
        <Select
          mode="multiple"
          allowClear
          style={{ width: "100%" }}
          placeholder={t("ChooseGroups")}
          value={groupIds}
          onChange={setGroupIds}
          options={groupOptions}
          optionFilterProp="label"
          notFoundContent={t("NoGroups")}
        />
      </Section>

      </div>

      <Section title={t("AppPrices")}>
        {channels.length ? (
          <>
            <Alert
              type="info"
              showIcon
              className="mb-3"
              title={t("AppPricesHint")}
            />
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={channels}
              scroll={{ x: 160 + priceCols.length * 140 }}
              columns={[
                {
                  title: t("App"),
                  width: 160,
                  render: (_, c) => (
                    <span>
                      <b>{nm(c)}</b>
                      <div style={{ color: C.muted, fontSize: 11 }}>
                        {Number(c.markupValue)
                          ? c.markupType === "percent"
                            ? t("MarkupPercentText", { v: c.markupValue })
                            : t("MarkupAmountText", {
                                v: money(c.markupValue),
                              })
                          : t("NoMarkup")}
                      </div>
                    </span>
                  ),
                },
                ...priceCols.map((r) => ({
                  title: r.label,
                  width: 140,
                  render: (_, c) => {
                    const key = `${c.id}:${r.sizeId}`;
                    return (
                      <InputNumber
                        size="small"
                        min={0}
                        style={{ width: "100%" }}
                        placeholder={money(channelDefaultPrice(r.price, c))}
                        value={prices[key] ?? null}
                        onChange={(v) =>
                          setPrices((m) => ({ ...m, [key]: v }))
                        }
                      />
                    );
                  },
                })),
              ]}
            />
          </>
        ) : (
          <div style={{ color: C.muted }}>{t("NoApps")}</div>
        )}
      </Section>
      {newCat && (
        <NewCategoryModal
          onClose={() => setNewCat(false)}
          onCreated={(c) => {
            setCategories((list) => [...list, c]);
            form.setFieldValue("categoryId", c.id);
          }}
        />
      )}
    </Modal>
  );
}

// ---------- قسم جديد من نافذة الصنف (الاسم بس) ----------
function NewCategoryModal({ onClose, onCreated }) {
  const t = useTranslations("Restaurant");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const req = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
  ];

  const submit = async (v) => {
    const fd = new FormData();
    fd.set("arName", v.arName);
    fd.set("enName", v.enName);
    fd.set("isActive", "true");
    setSaving(true);
    const res = await createCategoryAction(fd);
    setSaving(false);
    if (!res.success) {
      applyFieldErrors(form, res.fieldErrors, tAlerts);
      return showActionError(res, tAlerts, locale);
    }
    message.success(t("Saved"));
    onCreated({ id: res.data.id, arName: v.arName, enName: v.enName });
    onClose();
  };

  return (
    <Modal
      open
      width={520}
      title={t("NewCategory")}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form
        form={form}
        preserve={false}
        layout="vertical"
        autoComplete="off"
        onFinish={submit}
      >
        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item name="arName" label={t("ArName")} rules={req}>
              <Input autoComplete="off" autoFocus />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="enName" label={t("EnName")} rules={req}>
              <Input dir="ltr" autoComplete="off" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
