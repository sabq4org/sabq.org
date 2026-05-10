import { useState, useEffect } from "react";
import { SiGoogleplay, SiApple, SiHuawei } from "react-icons/si";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.sabqorg.sabq&hl=ar";
const APP_STORE_URL = "https://apps.apple.com/us/app/%D8%B3%D8%A8%D9%82/id521017976?l=ar";
const HUAWEI_APPGALLERY_URL = "https://appgallery.huawei.com/app/C105897661";

export function AppDownloadBanner() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Only show on mobile devices
  if (!isMobile) return null;

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border/50 safe-area-inset-bottom md:hidden"
      data-testid="banner-app-download"
    >
      <div className="flex items-center justify-center gap-4 py-2 px-4">
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-10 h-10 bg-black text-white rounded-full hover:bg-black/80 transition-colors"
          data-testid="link-app-store"
          aria-label="تحميل تطبيق سبق من App Store"
        >
          <SiApple className="w-5 h-5" aria-hidden="true" />
        </a>
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-10 h-10 bg-[#01875f] text-white rounded-full hover:bg-[#01875f]/90 transition-colors"
          data-testid="link-play-store"
          aria-label="تحميل تطبيق سبق من Google Play"
        >
          <SiGoogleplay className="w-5 h-5" aria-hidden="true" />
        </a>
        <a
          href={HUAWEI_APPGALLERY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-10 h-10 bg-[#c7112d] text-white rounded-full hover:bg-[#c7112d]/90 transition-colors"
          data-testid="link-huawei-appgallery"
          aria-label="تحميل تطبيق سبق من Huawei AppGallery"
        >
          <SiHuawei className="w-5 h-5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
