"use client";
import React from "react";
import { Button, Space } from "antd";

// عنوان الصفحة + زر الإضافة + (اختياري) أزرار إضافية مثل التصدير
// className: المسافة تحت العنوان (الافتراضي mb-6)
const PageHeader = ({ title, buttonTitle, onButtonClick, extra, className = "mb-6" }) => {
  return (
    <div className={`page-header flex flex-row flex-wrap justify-between items-center gap-3 ${className}`}>
      <h1 className="font-bold text-xl">{title}</h1>
      <Space wrap>
        {extra}
        {buttonTitle ? (
          <Button
            type="primary"
            style={{ padding: "20px 15px", fontSize: 18 }}
            onClick={onButtonClick}
          >
            {buttonTitle}
          </Button>
        ) : null}
      </Space>
    </div>
  );
};

export default PageHeader;
