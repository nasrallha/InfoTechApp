# actions
Server Actions (`"use server"`) التي تستدعيها الواجهة.
- ملف لكل قسم: `category.actions.js`, ...
- كل action: يتحقق من الصلاحية ← يتحقق من البيانات بـ `validations/` ← يستدعي `services/` ← يرجع `{ success, data | error }`.
