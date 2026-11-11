"use server";

// الرقم المتوقع للمستند الجديد (يظهر أعلى شاشة الإضافة)

import { z } from "zod";
import { runAction } from "@/lib/action";
import { peekNextDoc, SEQUENCE_KEYS } from "@/services/sequence.service";

const typeSchema = z.enum(Object.keys(SEQUENCE_KEYS));

export async function getNextDocNumberAction(type) {
  // { number, code }: الرقم المتوقع في فرع المستخدم + رمز الفرع
  return runAction(typeSchema, type, (t, user) =>
    peekNextDoc(t, user.branch.id),
  );
}
