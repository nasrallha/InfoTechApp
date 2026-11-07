"use client";

import { CameraOutlined, UploadOutlined } from "@ant-design/icons";
import { Button, Form, Upload } from "antd";
import { message } from "@/components/common/feedback";
import { useTranslations } from "next-intl";
import { IMAGE_TYPES, MAX_IMAGE_SIZE_MB } from "@/lib/image";

// يحوّل حدث الـ Upload إلى قائمة ملفات يحفظها الفورم
const normFile = (e) => (Array.isArray(e) ? e : e?.fileList);

// حقل رفع صورة واحدة (اختياري) نستخدمه في الأقسام والمنتجات وغيرها
// القيمة في الفورم = قائمة ملفات antd (fileList):
//   - ملف جديد: فيه originFileObj (الملف الحقيقي الذي نرسله للسيرفر)
//   - صورة موجودة سابقاً: فيها url فقط
//   - قائمة فاضية: لا توجد صورة
// card: مربع صورة صغير (النوافذ المضغوطة زي صنف المنيو)
export default function ImageUploadItem({ name = "image", label, card = false }) {
  const tButtons = useTranslations("Buttons");
  const tAlerts = useTranslations("Alerts");

  // التحقق قبل الإضافة للقائمة (في المتصفح)، والسيرفر يتحقق مرة ثانية
  const beforeUpload = (file) => {
    if (!IMAGE_TYPES.includes(file.type)) {
      message.error(tAlerts("AllowedImageTypes"));
      return Upload.LIST_IGNORE;
    }

    if (file.size / 1024 / 1024 > MAX_IMAGE_SIZE_MB) {
      message.error(tAlerts("ImageTooLarge"));
      return Upload.LIST_IGNORE;
    }

    // false = لا ترفع الملف الآن، احتفظ به في الفورم حتى نضغط حفظ
    return false;
  };

  return (
    <Form.Item
      name={name}
      label={label}
      valuePropName="fileList"
      getValueFromEvent={normFile}
    >
      <Upload
        listType={card ? "picture-card" : "picture"}
        maxCount={1}
        beforeUpload={beforeUpload}
        accept=".png,.jpg,.jpeg,.webp"
        className={card ? "image-upload-card" : undefined}
      >
        {card ? (
          <div className="image-upload-card__btn">
            <CameraOutlined />
            <span>{tButtons("Upload")}</span>
          </div>
        ) : (
          <Button icon={<UploadOutlined />}>{tButtons("Upload")}</Button>
        )}
      </Upload>
    </Form.Item>
  );
}
