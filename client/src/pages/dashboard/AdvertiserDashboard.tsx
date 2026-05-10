import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AdvertiserDashboard() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    document.title = "لوحة تحكم الإعلانات - سبق الذكية";
    setLocation("/dashboard/ads/campaigns");
  }, [setLocation]);

  return (
    <div className="flex items-center justify-center min-h-screen" dir="rtl">
      <p className="text-muted-foreground">جاري التحويل...</p>
    </div>
  );
}
