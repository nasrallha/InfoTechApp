"use server";

// الرقم المتوقع للمستند الجديد (يظهر أعلى شاشة الإضافة)

import { z } from "zod";
import { runAction } from "@/lib/action";
import { peekNextNumber, SEQUENCE_KEYS } from "@/services/sequence.service";

const typeSchema = z.enum(Object.keys(SEQUENCE_KEYS));

export async function getNextDocNumberAction(type) {
  return runAction(typeSchema, type, (t) => peekNextNumber(t));
}
