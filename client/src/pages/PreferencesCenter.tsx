import { Redirect } from "wouter";

/** مسار قديم — يُعاد توجيهه إلى قسم الاهتمامات */
export default function PreferencesCenterRedirect() {
  return <Redirect to="/settings/interests" />;
}
