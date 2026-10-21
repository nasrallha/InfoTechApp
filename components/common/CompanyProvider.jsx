"use client";
import { createContext, useContext } from "react";

// بيانات الشركة متاحة لكل الواجهة (رأس التقارير والقوائم المطبوعة)
const CompanyContext = createContext(null);

export function CompanyProvider({ company, children }) {
  return <CompanyContext value={company}>{children}</CompanyContext>;
}

// { arName, enName, taxNo, registrationNo, phone, logo, ... } أو null
export function useCompany() {
  return useContext(CompanyContext);
}
