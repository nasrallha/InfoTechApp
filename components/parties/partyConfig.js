import { TeamOutlined } from "@ant-design/icons";
import {
  createCustomerAction,
  updateCustomerAction,
  deleteCustomersAction,
  getNextCustomerCodeAction,
} from "@/actions/customer.actions";
import {
  createSupplierAction,
  updateSupplierAction,
  deleteSuppliersAction,
  getNextSupplierCodeAction,
} from "@/actions/supplier.actions";

// actions
export const PARTY_CONFIG = {
  customers: {
    permission: "customers", // بادئة الصلاحيات: customers.view / customers.create ...
    title: "Customers",
    addButton: "AddNewCustomer",
    addHeading: "AddCustomerHeading",
    editHeading: "EditCustomerHeading",
    added: "CustomerAdded",
    updated: "CustomerUpdated",
    deleted: "CustomerDeleted",
    balanceHint: "OpeningBalanceHintCustomer",
    // العميل اللي له رقم ضريبي = شركة: لازم العنوان الوطني كامل (الفاتورة الضريبية)
    b2b: true,
    Icon: TeamOutlined,
    createAction: createCustomerAction,
    updateAction: updateCustomerAction,
    deleteAction: deleteCustomersAction,
    nextCodeAction: getNextCustomerCodeAction,
  },
  suppliers: {
    permission: "suppliers",
    title: "Suppliers",
    addButton: "AddNewSupplier",
    addHeading: "AddSupplierHeading",
    editHeading: "EditSupplierHeading",
    added: "SupplierAdded",
    updated: "SupplierUpdated",
    deleted: "SupplierDeleted",
    balanceHint: "OpeningBalanceHintSupplier",
    Icon: TeamOutlined,
    createAction: createSupplierAction,
    updateAction: updateSupplierAction,
    deleteAction: deleteSuppliersAction,
    nextCodeAction: getNextSupplierCodeAction,
  },
};
