"use client";

import { useEffect, useState } from "react";
import { Col, Form, InputNumber, Switch, Table } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { showActionError } from "@/components/common/actionError";
import {
  activeLaundryServicesAction,
  getLaundryItemAction,
} from "@/actions/laundry.actions";
import { C } from "@/lib/theme";
import "@/components/common/table.css";

// ============================================================
// فورم الصنف (وحدة laundry): الصنف قطعة مغسلة (ثوب، شماغ...) + أسعارها
// - للخدمة بس (القطعة مالهاش مخزون)
// - لكل خدمة مغسلة: سعر عادي + مستعجل (العادي فاضي = مش متاحة)
// - الحفظ بيحصل بعد حفظ الصنف (laundryPayload في ProductForm)
// - ?laundry=1 في اللينك (من شاشة المغسلة): الصنف الجديد خدمة وقطعة مغسلة
// حقول الفورم:
//   laundryItem (صنف مغسلة)، laundryPrices { serviceId: { price, urgentPrice } }
//   laundryWas (كان صنف مغسلة قبل التعديل)، laundrySort (ترتيبه)
// ============================================================
// reloadKey: بيانات الصنف اتحدثت والفورم اترجع لها ← نحمّل الأسعار تاني
export default function LaundryProductFields({
  form,
  isEdit,
  productId,
  reloadKey,
}) {
  const t = useTranslations("Laundry");
  const tAlerts = useTranslations("Alerts");
  const locale = useLocale();
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const [services, setServices] = useState([]);
  const isService = Form.useWatch("isService", form) ?? false;
  const laundryItem = Form.useWatch("laundryItem", form) ?? false;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (isEdit) {
        const res = await getLaundryItemAction(productId);
        if (!alive) return;
        if (!res.success) return showActionError(res, tAlerts, locale);
        const { services: list, laundryItem: on, sortOrder, prices } =
          res.data;
        setServices(list);
        form.setFieldsValue({
          laundryItem: on,
          laundryWas: on,
          laundrySort: sortOrder,
          laundryPrices: Object.fromEntries(
            prices.map((p) => [
              p.serviceId,
              { price: p.price, urgentPrice: p.urgentPrice },
            ]),
          ),
        });
        return;
      }
      const res = await activeLaundryServicesAction();
      if (!alive) return;
      if (!res.success) return showActionError(res, tAlerts, locale);
      setServices(res.data);
      // جاي من شاشة المغسلة: الصنف الجديد خدمة وقطعة مغسلة
      if (new URLSearchParams(window.location.search).get("laundry") === "1")
        form.setFieldsValue({ isService: true, laundryItem: true });
    })();
    return () => {
      alive = false;
    };
    // مرة لكل صنف (ولما بياناته تتحدث)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, productId, reloadKey]);

  const numberStyle = { width: "100%" };

  return (
    <>
      {/* الحقول دي موجودة دايمًا عشان تتبعت مع الحفظ */}
      <Form.Item name="laundryWas" hidden valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item name="laundrySort" hidden>
        <InputNumber />
      </Form.Item>
      {/* سويتش "قطعة مغسلة" جنب "نشط" في الفورم، والأسعار هنا لما يتفعّل */}
      {isService && laundryItem && (
        <Col xs={24}>
          <h3 className="font-bold mb-3">{t("ProductPricesTitle")}</h3>
          {laundryItem &&
            (services.length ? (
              <Table
                className="mb-4"
                rowKey="id"
                size="small"
                bordered
                pagination={false}
                dataSource={services}
                scroll={{ x: 480 }}
                columns={[
                  {
                    title: t("Service"),
                    render: (_, s) => (
                      <span>
                        <b>{nm(s)}</b>
                        {s.isActive === false && (
                          <span
                            className="ms-2"
                            style={{ color: C.muted, fontSize: 12 }}
                          >
                            ({t("Inactive")})
                          </span>
                        )}
                      </span>
                    ),
                  },
                  {
                    title: t("Normal"),
                    width: 160,
                    render: (_, s) => (
                      <Form.Item
                        name={["laundryPrices", String(s.id), "price"]}
                        className="mb-0"
                      >
                        <InputNumber
                          min={0}
                          precision={2}
                          placeholder={t("NotAvailable")}
                          style={numberStyle}
                        />
                      </Form.Item>
                    ),
                  },
                  {
                    title: t("Urgent"),
                    width: 160,
                    render: (_, s) => (
                      <Form.Item
                        name={["laundryPrices", String(s.id), "urgentPrice"]}
                        className="mb-0"
                      >
                        <InputNumber
                          min={0}
                          precision={2}
                          placeholder={t("NotAvailable")}
                          style={numberStyle}
                        />
                      </Form.Item>
                    ),
                  },
                ]}
              />
            ) : (
              <div className="mb-4" style={{ color: C.muted, fontSize: 13 }}>
                {t("NoServicesYet")}
              </div>
            ))}
        </Col>
      )}
    </>
  );
}

// بيانات الحفظ من قيم الفورم (بعد حفظ الصنف)
// null = مفيش حاجة تتحفظ (مش صنف مغسلة ومكانش)
export function laundryPayload(values, productId) {
  const on = Boolean(values.isService && values.laundryItem);
  if (!on && !values.laundryWas) return null;
  const prices = Object.entries(values.laundryPrices ?? {})
    .filter(([, p]) => p?.price != null && p.price !== "")
    .map(([sid, p]) => ({
      serviceId: Number(sid),
      price: Number(p.price),
      urgentPrice:
        p.urgentPrice == null || p.urgentPrice === ""
          ? null
          : Number(p.urgentPrice),
    }));
  return {
    productId,
    laundryItem: on,
    sortOrder: values.laundrySort ?? 0,
    prices: on ? prices : [],
  };
}
