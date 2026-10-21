"use client";

import { message as staticMessage, Modal as StaticModal } from "antd";

// ============================================================
// رسائل التنبيه (نجاح / خطأ / تحذير) لكل البرنامج
// - نستخدم نسخة antd المربوطة بـ <App> (من AntdProvider) حتى تأخذ
//   ثيم البرنامج واتجاهه ولغته، بدل الدالة الثابتة message.success
//   (اللي بتطلع تحذير "Static function can not consume context")
// - الاستخدام كما هو: import { message } from "@/components/common/feedback";
//   message.success("...")
// ============================================================

let instance = null;

// يستدعيها AntdProvider بالنسخة المربوطة بالثيم
export function setMessageInstance(api) {
  instance = api;
}

const call =
  (method) =>
  (...args) =>
    (instance ?? staticMessage)[method](...args);

export const message = {
  success: call("success"),
  error: call("error"),
  warning: call("warning"),
  info: call("info"),
  loading: call("loading"),
  open: call("open"),
  destroy: call("destroy"),
};

// نوافذ التنبيه (modal.error / modal.confirm ...) بنفس الطريقة
let modalInstance = null;

export function setModalInstance(api) {
  modalInstance = api;
}

const callModal =
  (method) =>
  (...args) =>
    (modalInstance ?? StaticModal)[method](...args);

export const modal = {
  error: callModal("error"),
  info: callModal("info"),
  success: callModal("success"),
  warning: callModal("warning"),
  confirm: callModal("confirm"),
};
