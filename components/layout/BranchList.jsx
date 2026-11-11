"use client";

import { createContext, useContext } from "react";

// ============================================================
// الفروع اللي مدير النظام يقدر يتنقل بينها (من MainLayout)
// - مبدّل الفرع فوق، واختيار الفرع جوه فورم المستند (DocBranchSelect)
// - غير مدير النظام: قائمة فاضية
// ============================================================
export const BranchListContext = createContext([]);

export const useBranchList = () => useContext(BranchListContext);
