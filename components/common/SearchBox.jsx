"use client";

import { Button, Input, Space } from "antd";
import { SearchOutlined } from "@ant-design/icons";

// ============================================================
// حقل بحث موحد للبرنامج كله: الحقل + زر بحث ملوّن بنفس الارتفاع تماماً
// - Enter أو الضغط على الزر ← onSearch(النص)
// - buttonText (اختياري): نص بجانب أيقونة الزر (مثل "عرض الفاتورة")
// ============================================================
export default function SearchBox({
  value,
  onChange,
  onSearch,
  placeholder,
  width,
  buttonText,
  loading,
  allowClear = true,
  autoFocus,
  dir,
  className,
}) {
  return (
    <Space.Compact
      className={`search-box ${className ?? ""}`}
      style={{ width: width ?? "100%", maxWidth: "100%" }}
    >
      <Input
        allowClear={allowClear}
        autoFocus={autoFocus}
        dir={dir}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onPressEnter={() => onSearch?.(value ?? "")}
      />
      <Button
        type="primary"
        icon={<SearchOutlined />}
        loading={loading}
        onClick={() => onSearch?.(value ?? "")}
        className="search-box__button"
      >
        {buttonText}
      </Button>
    </Space.Compact>
  );
}
