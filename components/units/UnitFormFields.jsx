"use client";
import { Input, Form, Switch, Row, Col, Tooltip } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { C } from "@/lib/theme";

// حقول فورم الوحدة (مشتركة بين الإضافة والتعديل)
// الاسمين جنب بعض، والسويتشين (نشطة / تقبل كسور) في صف واحد
export default function UnitFormFields({ tForm, tAlerts }) {
  const nameRules = [
    { required: true, whitespace: true, message: tAlerts("RequiredField") },
    { min: 3, message: tAlerts("MinCharcters") },
    { max: 50, message: tAlerts("MaxCharacters") },
  ];

  return (
    <>
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item
            label={tForm("ArName")}
            name="arName"
            hasFeedback
            rules={nameRules}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            label={tForm("EnName")}
            name="enName"
            hasFeedback
            rules={nameRules}
          >
            <Input />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={12}>
        <Col xs={12}>
          <Form.Item
            name="isActive"
            label={tForm("Active")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
        <Col xs={12}>
          <Form.Item
            name="allowDecimals"
            label={
              <span>
                {tForm("AllowDecimals")}{" "}
                <Tooltip title={tForm("AllowDecimalsHint")}>
                  <QuestionCircleOutlined style={{ color: C.subtle }} />
                </Tooltip>
              </span>
            }
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
      </Row>

      <hr />
    </>
  );
}
