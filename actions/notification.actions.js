"use server";

// جرس الإشعارات الموحد في الهيدر (كل نوع حسب صلاحيات المستخدم)
import { runAction } from "@/lib/action";
import { getNotifications } from "@/services/notification.service";

export async function getNotificationsAction() {
  return runAction(null, null, (_, user) => getNotifications(user));
}
