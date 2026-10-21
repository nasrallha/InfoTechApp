"use client";

import React, { useState } from "react";
import { Modal } from "antd";
import { useTranslations } from "next-intl";
import "./FormModal.css";

const FormModal = ({
  children,
  open,
  onCancel,
  onOk,
  title,
  formId,
  width = 550, // عرض النافذة (الفورمات الكبيرة مثل العملاء تحتاج عرضاً أكبر)
}) => {
  const [loading, setLoading] = useState(false);

  const tButtons = useTranslations("Buttons");

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  const handleSuccess = (data) => {
    if (onCancel) {
      onCancel(data);
    }
  };

  return (
    <Modal
      title={title}
      closable={false}
      open={open}
      onCancel={handleCancel}
      okText={tButtons("Ok")}
      cancelText={tButtons("Cancel")}
      width={width}
      destroyOnHidden

      onOk={onOk}
      okButtonProps={
        onOk
          ? {
              loading: loading,
            }
          : formId
            ? {
                form: formId,
                htmlType: "submit",
                loading: loading,
              }
            : undefined
      }
    >
      {React.isValidElement(children) &&
        React.cloneElement(children, {
          onSuccess: handleSuccess,
          setLoading,
        })}
    </Modal>
  );
};

export default FormModal;