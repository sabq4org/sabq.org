import { Redirect } from "wouter";

/** مسار قديم — يُعاد توجيهه إلى قسم الإشعارات */
export default function EnglishNotificationSettingsRedirect() {
  return <Redirect to="/settings/notifications" />;
}
