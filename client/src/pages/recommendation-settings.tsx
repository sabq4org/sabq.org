import { Redirect } from "wouter";

/** مسار قديم — يُعاد توجيهه إلى قسم الإشعارات */
export default function RecommendationSettingsRedirect() {
  return <Redirect to="/settings/notifications" />;
}
