import UsersAdminListPage from "./UsersAdminListPage";

/** /dashboard/readers: القائمة نفسها بعرض القرّاء افتراضيًا (مسار نظيف للتنقل الجانبي). */
export default function ReadersListPage() {
  return <UsersAdminListPage defaultKind="readers" />;
}
