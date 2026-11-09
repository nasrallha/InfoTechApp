"use client";

import React, { useMemo } from "react";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Form, Input, InputNumber, Select, Row, Col } from "antd";
import { useLocale, useTranslations } from "next-intl";
import { C } from "@/lib/theme";

// عنصر قابل للسحب (لترتيب الوحدات)
const SortableItem = ({ id, children }) => {
  const { setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { position: "relative", zIndex: 9999 } : {}),
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children}
    </div>
  );
};

// الوحدات الإضافية للمنتج (علبة، كرتونة ...)
// form: فورم المنتج (نقرأ منه الوحدة الأساسية حتى نستبعدها من القائمة)
// units: كل الوحدات النشطة (من السيرفر)
// hideStock: إخفاء الرصيد الافتتاحي (رصيد المستودع الرئيسي) لموظف الفرع
// compact: في نص الشاشة (جنب الصورة) ← كل وحدة على سطرين في الشاشات الكبيرة
const AdditionalUnitsForm = ({
  form,
  units = [],
  hideStock = false,
  compact = false,
}) => {
  // عرض الحقل: md زي ما هو، وlg في نص الشاشة
  const sp = (md, lg) => (compact ? { md, lg } : { md });
  const locale = useLocale();
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");
  const tPlaceholders = useTranslations("Placeholders");
  const tUnits = useTranslations("ProductUnits");

  // نراقب الوحدة الأساسية: لا تظهر في قائمة الوحدات الإضافية
  const baseUnitId = Form.useWatch("baseUnitId", form);

  const unitOptions = useMemo(
    () =>
      units
        .filter((u) => u.id !== baseUnitId)
        .map((u) => ({ value: u.id, label: locale === "ar" ? u.arName : u.enName })),
    [units, baseUnitId, locale],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 1 } }),
  );

  const required = [{ required: true, message: tAlerts("RequiredField") }];

  return (
    <Form.List name="units">
      {(fields, { add, remove, move }) => {
        const onDragEnd = ({ active, over }) => {
          if (over && active.id !== over.id) {
            const from = fields.findIndex((f) => f.key === active.id);
            const to = fields.findIndex((f) => f.key === over.id);
            if (from !== -1 && to !== -1) move(from, to);
          }
        };

        return (
          <DndContext
            sensors={sensors}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={fields.map((f) => f.key)}
              strategy={verticalListSortingStrategy}
            >
              {fields.map(({ key, name, ...restField }) => (
                <SortableItem key={key} id={key}>
                  <Row
                    gutter={[8, 0]}
                    align="top"
                    className="mb-3"
                    style={{
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: "8px 4px 0",
                      background: C.bgSubtle,
                    }}
                  >
                    {/* الوحدة */}
                    <Col xs={24} {...sp(4, 8)}>
                      <Form.Item
                        {...restField}
                        name={[name, "unitId"]}
                        label={tUnits("Unit")}
                        rules={required}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder={tPlaceholders("UnitName")}
                          options={unitOptions}
                        />
                      </Form.Item>
                    </Col>

                    {/* معامل التحويل: كم وحدة أساسية داخل هذه الوحدة */}
                    <Col xs={12} {...sp(3, 6)}>
                      <Form.Item
                        {...restField}
                        name={[name, "conversionFactor"]}
                        label={tUnits("ConversionFactor")}
                        tooltip={tUnits("ConversionFactorHint")}
                        rules={[
                          ...required,
                          {
                            validator: (_, v) =>
                              v === null || v === undefined || v > 1
                                ? Promise.resolve()
                                : Promise.reject(tAlerts("ConversionFactorInvalid")),
                          },
                        ]}
                      >
                        <InputNumber
                          min={0}
                          placeholder={tPlaceholders("ConversionFactor")}
                          style={{ width: "100%" }}
                        />
                      </Form.Item>
                    </Col>

                    {/* باركود الوحدة (اختياري) */}
                    <Col xs={12} {...sp(4, 10)}>
                      <Form.Item
                        {...restField}
                        name={[name, "barcode"]}
                        label={tUnits("Barcode")}
                      >
                        <Input placeholder={tPlaceholders("Barcode")} />
                      </Form.Item>
                    </Col>

                    {/* سعر الوحدة */}
                    <Col xs={12} {...sp(3, 7)}>
                      <Form.Item
                        {...restField}
                        name={[name, "price"]}
                        label={tUnits("Price")}
                        rules={required}
                      >
                        <InputNumber
                          min={0}
                          placeholder={tPlaceholders("UnitPrice")}
                          style={{ width: "100%" }}
                        />
                      </Form.Item>
                    </Col>

                    {/* تكلفة الوحدة */}
                    <Col xs={12} {...sp(3, 7)}>
                      <Form.Item
                        {...restField}
                        name={[name, "cost"]}
                        label={tUnits("Cost")}
                      >
                        <InputNumber
                          min={0}
                          placeholder={tPlaceholders("UnitCost")}
                          style={{ width: "100%" }}
                        />
                      </Form.Item>
                    </Col>

                    {/* الرصيد الافتتاحي بهذه الوحدة (10 كرتونة) - اختياري
                        (موظف الفرع: مخفي، رصيده في جدول المستودعات) */}
                    <Col
                      xs={10}
                      {...sp(5, 8)}
                      style={hideStock ? { display: "none" } : undefined}
                    >
                      <Form.Item
                        {...restField}
                        name={[name, "startStock"]}
                        label={tUnits("StartStock")}
                        tooltip={tUnits("StartStockHint")}
                      >
                        <InputNumber
                          min={0}
                          precision={3}
                          placeholder={tPlaceholders("UnitStartStock")}
                          style={{ width: "100%" }}
                          formatter={(v) =>
                            v === "" || v == null ? "" : String(Number(v))
                          }
                        />
                      </Form.Item>
                    </Col>

                    {/* حذف السطر */}
                    <Col xs={2} {...sp(2, 2)} className="flex items-center justify-center"
                      style={{ paddingTop: 38 }}>
                      <MinusCircleOutlined
                        style={{ fontSize: 18, color: C.danger }}
                        onClick={() => remove(name)}
                      />
                    </Col>
                  </Row>
                </SortableItem>
              ))}

              <Form.Item>
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  {tButtons("AddMoreUnits")}
                </Button>
              </Form.Item>
            </SortableContext>
          </DndContext>
        );
      }}
    </Form.List>
  );
};

export default AdditionalUnitsForm;
