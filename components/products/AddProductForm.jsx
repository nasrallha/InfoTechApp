"use client";

import React, { useState } from "react";
import { UploadOutlined } from "@ant-design/icons";
import {
  Form,
  Input,
  Select,
  Button,
  Upload,
  Switch,
  InputNumber,
  Row,
  Col,
} from "antd";
import { message } from "@/components/common/feedback";
import { useTranslations } from "next-intl";
import "./productForm.css";

import AdditionalUnitsForm from "./AdditionalUnitsForm";

const normFile = (e) => {
  if (Array.isArray(e)) {
    return e;
  }

  return e?.fileList;
};

const dummyRequest = ({ onSuccess }) => {
  setTimeout(() => {
    onSuccess("ok");
  }, 0);
};

const AddProductForm = () => {
  const [form] = Form.useForm();

  const tForm = useTranslations("Form");
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");

  const handleBeforeUpload = (file) => {
    const fileName = file.name.toLowerCase();

    const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp"];

    const hasAllowedExtension = allowedExtensions.some((ext) =>
      fileName.endsWith(ext),
    );

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    const isAllowedType = allowedTypes.includes(file.type);

    if (!isAllowedType && !hasAllowedExtension) {
      message.error(tAlerts("AllowedImageTypes"));
      return Upload.LIST_IGNORE;
    }

    const maxSizeMB = 2;

    const isLtMaxSize = file.size / 1024 / 1024 < maxSizeMB;

    if (!isLtMaxSize) {
      message.error(`${tAlerts("AllowedImageSize")} ${maxSizeMB}MB!`);
      return Upload.LIST_IGNORE;
    }

    return false;
  };

  //onfinsh
  const onFinish = (values) => {
    const fullPayload = {
      ...values,

      AdditionalUnits: values.AdditionalUnits,
    };

    console.log("Full product and units data:", fullPayload);
  };

  const handleResetForm = () => {
    form.resetFields();
  };

  return (
    <div>
      <Form
        name="AddProduct"
        className="add-product-form"
        form={form}
        layout="vertical"
        initialValues={{
          Code: "",
          ArName: "",
          EnName: "",
          Category: undefined,
          BaseUnit: undefined,
          Price: 0,
          Cost: 0,
          WholesalePrice: 0,
          StartStock: 0,
          TaxRate: 15,
          PriceIncludeTax: false,
          IsActive: true,
          Image: [],
          AdditionalUnits: [],
        }}
        onFinish={onFinish}
        autoComplete="off"
      >
        <Row gutter={[16, 16]}>
          {/* Product Code */}
          <Col xs={24} sm={24} md={8} lg={4}>
            <Form.Item
              name="Code"
              label={tForm("Code")}
              rules={[
                {
                  whitespace: true,
                  required: true,
                  message: tAlerts("RequiredField"),
                },
              ]}
              hasFeedback
            >
              <Input />
            </Form.Item>
          </Col>

          {/* Arabic Name */}
          <Col xs={24} sm={24} md={8} lg={8}>
            <Form.Item
              name="ArName"
              label={tForm("ArName")}
              rules={[
                {
                  required: true,
                  message: tAlerts("RequiredField"),
                },
                {
                  whitespace: true,
                },
                {
                  min: 3,
                  message: tAlerts("MinCharcters"),
                },
              ]}
              hasFeedback
            >
              <Input />
            </Form.Item>
          </Col>

          {/* English Name */}
          <Col xs={24} sm={24} md={8} lg={8}>
            <Form.Item
              name="EnName"
              label={tForm("EnName")}
              rules={[
                {
                  required: true,
                  message: tAlerts("RequiredField"),
                },
                {
                  whitespace: true,
                },
                {
                  min: 3,
                  message: tAlerts("MinCharcters"),
                },
              ]}
              hasFeedback
            >
              <Input />
            </Form.Item>
          </Col>

          {/* Category */}
          <Col xs={24} sm={24} md={6} lg={4}>
            <Form.Item
              name="Category"
              label={tForm("Category")}
              rules={[
                {
                  required: true,
                  message: tAlerts("RequiredField"),
                },
              ]}
              hasFeedback
            >
              <Select
                showSearch
                placeholder="Select Category"
                style={{ width: "100%" }}
                options={[
                  { value: 1, label: "samsung" },
                  { value: 2, label: "Apple" },
                  { value: 3, label: "ViVo" },
                ]}
                filterOption={(input, option) =>
                  (option?.label ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </Col>

          {/* Base Unit */}
          <Col xs={24} sm={24} md={6} lg={4}>
            <Form.Item
              name="BaseUnit"
              label={tForm("BaseUnit")}
              rules={[
                {
                  required: true,
                  message: tAlerts("RequiredField"),
                },
              ]}
              hasFeedback
            >
              <Select
                showSearch
                allowClear
                style={{ width: "100%" }}
                options={[
                  { value: 1, label: "حبة" },
                  { value: 2, label: "شدة" },
                  { value: 3, label: "كرتونة" },
                ]}
                filterOption={(input, option) =>
                  (option?.label ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </Col>

          {/* Cost */}
          <Col xs={12} sm={12} md={6} lg={3}>
            <Form.Item
              name="Cost"
              label={tForm("Cost")}
              rules={[
                {
                  required: true,
                  message: tAlerts("RequiredField"),
                },
              ]}
              hasFeedback
            >
              <InputNumber
                min={0}
                style={{
                  width: "100%",
                  height: 40,
                }}
              />
            </Form.Item>
          </Col>

          {/* Price */}
          <Col xs={12} sm={12} md={6} lg={3}>
            <Form.Item
              name="Price"
              label={tForm("Price")}
              rules={[
                {
                  required: true,
                  message: tAlerts("RequiredField"),
                },
              ]}
              hasFeedback
            >
              <InputNumber
                min={0}
                style={{
                  width: "100%",
                  height: 40,
                }}
              />
            </Form.Item>
          </Col>

          {/* Wholesale Price */}
          <Col xs={12} sm={12} md={6} lg={3}>
            <Form.Item name="WholesalePrice" label={tForm("WholesalePrice")}>
              <InputNumber
                min={0}
                style={{
                  width: "100%",
                  height: 40,
                }}
              />
            </Form.Item>
          </Col>

          {/* Initial Stock */}
          <Col xs={12} sm={12} md={6} lg={3}>
            <Form.Item name="StartStock" label={tForm("StartStock")}>
              <InputNumber
                min={0}
                style={{
                  width: "100%",
                  height: 40,
                }}
              />
            </Form.Item>
          </Col>

          {/* Tax Rate */}
          <Col xs={12} sm={12} md={6} lg={3}>
            <Form.Item name="TaxRate" label={tForm("TaxRate")}>
              <InputNumber
                min={0}
                max={100}
                style={{
                  height: 40,
                  width: "100%",
                }}
              />
            </Form.Item>
          </Col>

          {/* Product Image */}
          <Col xs={24} sm={24} md={6} lg={5}>
            <Form.Item
              name="Image"
              label={tForm("Image")}
              valuePropName="fileList"
              getValueFromEvent={normFile}
            >
              <Upload
                name="ProductImage"
                listType="picture"
                maxCount={1}
                customRequest={dummyRequest}
                beforeUpload={handleBeforeUpload}
                accept=".png,.jpg,.jpeg,.webp"
              >
                <Button icon={<UploadOutlined />}>{tButtons("Upload")}</Button>
              </Upload>
            </Form.Item>
          </Col>

          {/* Price Includes Tax */}
          <Col xs={24} sm={12} md={8} lg={4} className="flex items-center">
            <Form.Item
              name="PriceIncludeTax"
              valuePropName="checked"
              label={tForm("PriceIncludeTax")}
              layout="horizontal"
              className="w-full mb-0"
            >
              <Switch />
            </Form.Item>
          </Col>

          {/* Active Status */}
          <Col xs={24} sm={12} md={8} lg={4} className="flex items-center">
            <Form.Item
              name="IsActive"
              label={tForm("Active")}
              valuePropName="checked"
              layout="horizontal"
              className="w-full mb-0"
            >
              <Switch />
            </Form.Item>
          </Col>

          {/* Additional Units */}
          <Col xs={24} sm={12} md={6} lg={3} className="flex items-center">
            <AdditionalUnitsForm form={form} />
          </Col>
        </Row>

        {/* Product Buttons */}
        <div className="flex flex-wrap justify-end gap-5 mx-2 my-4">
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            style={{
              height: 50,
              width: 150,
              fontSize: 20,
              backgroundColor: "#30336b",
            }}
          >
            {tButtons("Add")}
          </Button>

          <Button
            variant="solid"
            color="danger"
            htmlType="reset"
            size="large"
            onClick={handleResetForm}
            style={{
              height: 50,
              width: 150,
              fontSize: 20,
            }}
          >
            {tButtons("Reset")}
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default AddProductForm;
