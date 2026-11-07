"use client";

import { useState } from "react";
import {
  Button,
  Col,
  Input,
  InputNumber,
  Modal,
  Row,
  Switch,
  Tag,
} from "antd";
import { MinusOutlined, PlusOutlined } from "@ant-design/icons";
import "@/components/pos/pos.css";
import { useLocale, useTranslations } from "next-intl";
import { useCurrency } from "@/components/common/CurrencyProvider";
import { C } from "@/lib/theme";

// ============================================================
// نافذة سطر الطلب: القطعة ← الخدمة ← عادي/مستعجل ← الإضافات ← العدد
// - الخدمات أزرار بسعرها (الخدمة المختارة ممتلئة)
// - مستعجل: بيتقفل لو الخدمة مالهاش سعر مستعجل
// - الإضافات: مجموعة الاختيار الواحد (النشا) الضغط على واحدة بيلغي التانية
//   والضغط على المختارة بيشيلها (بدون)
// line: السطر للتعديل (أو null لسطر جديد)
// ============================================================
// canChangePrice: صلاحية تغيير سعر البيع ← خانة السعر قابلة للتعديل
export default function LaundryLineModal({
  item,
  groups,
  services,
  line,
  canChangePrice = false,
  onOk,
  onClose,
}) {
  const t = useTranslations("Laundry");
  const locale = useLocale();
  const { amount: money } = useCurrency();
  const nm = (x) => (locale === "ar" ? x.arName : x.enName);
  const prices = new Map(item.prices.map((p) => [p.serviceId, p]));
  const available = services.filter((s) => prices.has(s.id));

  const [serviceId, setServiceId] = useState(
    line?.serviceId ?? available[0]?.id ?? null,
  );
  const price = prices.get(serviceId);
  const [urgent, setUrgent] = useState(line?.isUrgent ?? false);
  const canUrgent = price?.urgentPrice != null;
  const isUrgent = urgent && canUrgent;
  const [addonIds, setAddonIds] = useState(line?.addonIds ?? []);
  const [qty, setQty] = useState(line?.qty ?? 1);
  const [notes, setNotes] = useState(line?.notes ?? "");
  // سعر مكتوب بإيد (null = سعر القائمة) ويرجع للقائمة لما الخدمة / المستعجل يتغير
  const [customPrice, setCustomPrice] = useState(line?.price ?? null);

  const toggleAddon = (group, id) =>
    setAddonIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // الاختيار الواحد: نشيل باقي إضافات المجموعة
      const others = group.multiple
        ? prev
        : prev.filter((x) => !group.addons.some((a) => a.id === x));
      return [...others, id];
    });

  const listUnit = price ? (isUrgent ? price.urgentPrice : price.price) : 0;
  const unit = canChangePrice && customPrice != null ? customPrice : listUnit;

  const submit = () =>
    onOk({
      productId: item.productId,
      serviceId,
      isUrgent,
      addonIds,
      qty: qty || 1,
      notes: notes.trim() || null,
      // السعر لو اتغير عن القائمة
      price:
        canChangePrice && customPrice != null && customPrice !== listUnit
          ? customPrice
          : null,
    });

  return (
    <Modal
      open
      width={620}
      title={nm(item)}
      okText={line ? t("UpdateLine") : t("AddLine")}
      okButtonProps={{ disabled: !serviceId }}
      onOk={submit}
      onCancel={onClose}
      mask={{ closable: false }}
      destroyOnHidden
    >
      <div className="lr-section">{t("Service")}</div>
      <div className="lr-choices">
        {available.map((s) => {
          const p = prices.get(s.id);
          return (
            <button
              type="button"
              key={s.id}
              className={`lr-choice ${serviceId === s.id ? "is-on" : ""}`}
              onClick={() => {
                setServiceId(s.id);
                setCustomPrice(null);
              }}
            >
              <b>{nm(s)}</b>
              <span>
                <bdi>{money(p.price)}</bdi>
                {p.urgentPrice != null && (
                  <>
                    {" • "}
                    <span style={{ color: C.warningText }}>
                      {t("Urgent")} <bdi>{money(p.urgentPrice)}</bdi>
                    </span>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <Row gutter={12} align="middle" className="mt-3">
        <Col xs={8} md={6}>
          <div className="lr-section">{t("Urgent")}</div>
          <Switch
            checked={isUrgent}
            disabled={!canUrgent}
            onChange={(v) => {
              setUrgent(v);
              setCustomPrice(null);
            }}
          />
          {!canUrgent && (
            <div style={{ color: C.muted, fontSize: 12 }}>
              {t("NoUrgentForService")}
            </div>
          )}
        </Col>
        {/* العدد: أزرار كبيرة للتاتش (− أحمر / + أخضر) زي الكاشير */}
        <Col xs={16} md={10}>
          <div className="lr-section">{t("Qty")}</div>
          <span className="pos-qty">
            <Button
              className="pos-qty__minus"
              icon={<MinusOutlined />}
              aria-label={t("Decrease")}
              title={t("Decrease")}
              disabled={(qty || 1) <= 1}
              onClick={() => setQty(Math.max(1, (qty || 1) - 1))}
            />
            <InputNumber
              min={1}
              max={999}
              precision={0}
              controls={false}
              value={qty}
              onFocus={(e) => e.target.select()}
              onChange={(v) => setQty(v || 1)}
            />
            <Button
              className="pos-qty__plus"
              icon={<PlusOutlined />}
              aria-label={t("Increase")}
              title={t("Increase")}
              onClick={() => setQty(Math.min(999, (qty || 1) + 1))}
            />
          </span>
        </Col>
        {canChangePrice && (
          <Col xs={12} md={8}>
            <div className="lr-section">{t("Price")}</div>
            <InputNumber
              size="large"
              min={0}
              precision={2}
              value={unit}
              onFocus={(e) => e.target.select()}
              onChange={(v) => setCustomPrice(v ?? null)}
              style={{ width: "100%" }}
            />
          </Col>
        )}
        <Col xs={12} md={8}>
          <div className="lr-section">{t("LineTotal")}</div>
          <b style={{ fontSize: 18 }}>
            <bdi>{money(unit * (qty || 1))}</bdi>
          </b>
        </Col>
      </Row>

      {groups.map((g) => (
        <div key={g.id} className="mt-3">
          <div className="lr-section">
            {nm(g)}{" "}
            <span style={{ color: C.muted, fontWeight: 400, fontSize: 12 }}>
              ({g.multiple ? t("Multiple") : t("Single")})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {g.addons.map((a) => (
              <Tag.CheckableTag
                key={a.id}
                className="lr-addon"
                checked={addonIds.includes(a.id)}
                onChange={() => toggleAddon(g, a.id)}
              >
                {nm(a)}
              </Tag.CheckableTag>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-3">
        <div className="lr-section">{t("LineNotes")}</div>
        <Input
          maxLength={255}
          autoComplete="off"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Modal>
  );
}
