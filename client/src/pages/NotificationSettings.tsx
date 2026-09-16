import { Redirect } from "wouter";

/** مسار قديم — يُعاد توجيهه إلى مركز الإعدادات */
export default function NotificationSettingsRedirect() {
  return <Redirect to="/settings/notifications" />;
}
