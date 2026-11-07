"use client";
import { SearchOutlined, DownOutlined } from "@ant-design/icons";
import { Button, Input, Select, Space } from "antd";

// أدوات مشتركة لفلاتر جداول antd (نستخدمها في الوحدات والمنتجات وغيرها)

// فلتر بحث نصي على عمود
// getValue: دالة ترجع النص الذي نبحث فيه من السطر
export function textFilter({ getValue, placeholder, tButtons }) {
  return {
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }}>
        <Input
          autoFocus
          placeholder={placeholder}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => confirm()}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => confirm()}
            size="small"
            style={{ width: 90 }}
          >
            {tButtons("Search")}
          </Button>
          <Button
            onClick={() => {
              clearFilters?.();
              confirm();
            }}
            size="small"
            style={{ width: 90 }}
          >
            {tButtons("Reset")}
          </Button>
        </Space>
      </div>
    ),
    filterIcon: () => <SearchOutlined />,
    onFilter: (value, record) =>
      String(getValue(record) ?? "")
        .toLowerCase()
        .includes(String(value).toLowerCase()),
  };
}

// فلتر الحالة (نشط / غير نشط) على حقل isActive
export function statusFilter({ tForm }) {
  return {
    filterDropdown: ({ setSelectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }}>
        <Select
          style={{ width: 200 }}
          allowClear
          placeholder={tForm("Status")}
          onChange={(value) => {
            if (value === undefined) clearFilters?.();
            else setSelectedKeys([value]);
            confirm();
          }}
          options={[
            { value: true, label: tForm("Active") },
            { value: false, label: tForm("NotActive") },
          ]}
        />
      </div>
    ),
    filterIcon: () => <DownOutlined style={{ fontSize: 20 }} />,
    onFilter: (value, record) => record.isActive === value,
  };
}

// شارة الحالة الملونة (نفس شكل جدول الوحدات)
export function StatusBadge({ active, tForm }) {
  return (
    <span
      className={`font-bold p-1 px-2.5 rounded-md text-xs inline-block text-white ${
        active ? "bg-green-600" : "bg-(--c-danger)"
      }`}
    >
      {active ? tForm("Active") : tForm("NotActive")}
    </span>
  );
}
