import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, ReactNode } from "react";
import { 
  Facebook,
  Instagram,
  Youtube,
  Linkedin,
  ArrowUp,
  Mail,
  MessageCircle,
  ChevronDown
} from "lucide-react";
import { SiX, SiTiktok, SiWhatsapp, SiGoogleplay, SiApple, SiHuawei } from "react-icons/si";
import sabqLogo from "../../../public/branding/identity/sabq-logo-white.svg";

function MobileCollapsible({ title, children }: { title: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-[#2a4052]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full py-3 text-sm font-medium"
        data-testid={`collapsible-${title}`}
      >
        {title}
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="pb-3">{children}</div>}
    </div>
  );
}

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.sabqorg.sabq&hl=ar";
const APP_STORE_URL = "https://apps.apple.com/us/app/%D8%B3%D8%A8%D9%82/id521017976?l=ar";
const HUAWEI_APPGALLERY_URL = "https://appgallery.huawei.com/app/C105897661";

interface Category {
  id: string;
  nameAr: string;
  slug: string;
}

export function Footer() {
  const currentYear = new Date().getFullYear();

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
    staleTime: 5 * 60 * 1000,
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const infoLinks = [
    { label: "من نحن", href: "/about" },
    { label: "سياسة الخصوصية", href: "/ar/privacy" },
    { label: "شروط الاستخدام", href: "/ar/terms" },
  ];

  const socialLinks = [
    { icon: SiX, href: "https://x.com/sabqorg", label: "إكس" },
    { icon: Facebook, href: "https://www.facebook.com/sabq.org", label: "فيسبوك" },
    { icon: Instagram, href: "https://www.instagram.com/sabqorg", label: "إنستغرام" },
    { icon: Youtube, href: "https://youtube.com/@sabqorg", label: "يوتيوب" },
    { icon: SiTiktok, href: "https://www.tiktok.com/@sabqorg", label: "تيك توك" },
    { icon: Linkedin, href: "https://www.linkedin.com/in/sabqorg", label: "لينكدإن" },
    { icon: SiWhatsapp, href: "https://whatsapp.com/channel/0029VaCUMDGEAKWA2soRAl02", label: "واتساب" },
  ];

  const mainCategories = categories;

  return (
    <footer 
      id="footer" 
      className="bg-[#0e2233] text-[#f1f6fa] border-t border-[#2a4052]"
      data-testid="footer" 
      dir="rtl"
    >
      {/* Mobile Footer - Compact & Centered */}
      <div className="md:hidden container mx-auto px-4 py-5">
        {/* Logo & Description Centered */}
        <div className="flex flex-col items-center gap-2 mb-4">
          <Link href="/" data-testid="footer-logo-mobile">
            <img 
              src={sabqLogo} 
              alt="سبق" 
              className="h-[66px] w-[74px] object-contain"
              loading="lazy"
              width={74}
              height={66}
              decoding="async"
            />
          </Link>
          <p className="text-xs text-[#b2c3d0] text-center">
            منصة إخبارية سعودية ذكية
          </p>
          
          {/* App Download Icons - Small colored rectangles */}
          <div className="flex items-center gap-2 mt-2">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-8 h-8 bg-black text-white rounded-md hover:bg-black/80 transition-colors"
              data-testid="footer-link-app-store-mobile"
              aria-label="App Store"
            >
              <SiApple className="w-4 h-4" aria-hidden="true" />
            </a>
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-8 h-8 bg-[#01875f] text-white rounded-md hover:bg-[#01875f]/80 transition-colors"
              data-testid="footer-link-play-store-mobile"
              aria-label="Google Play"
            >
              <SiGoogleplay className="w-4 h-4" aria-hidden="true" />
            </a>
            <a
              href={HUAWEI_APPGALLERY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-8 h-8 bg-[#c7112d] text-white rounded-md hover:bg-[#c7112d]/80 transition-colors"
              data-testid="footer-link-huawei-mobile"
              aria-label="Huawei AppGallery"
            >
              <SiHuawei className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* Collapsible Categories */}
        <MobileCollapsible title="التصنيفات">
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {mainCategories.map((cat) => (
              <li key={cat.id}>
                <Link href={`/category/${cat.slug}`}>
                  <span className="text-xs text-[#b2c3d0] hover:text-white">
                    {cat.nameAr}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </MobileCollapsible>

        {/* Collapsible Info */}
        <MobileCollapsible title="معلومات">
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {infoLinks.map((link, i) => (
              <li key={i}>
                <Link href={link.href}>
                  <span className="text-xs text-[#b2c3d0] hover:text-white">
                    {link.label}
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <Link href="/contact">
                <span className="inline-flex items-center gap-1 text-xs text-[#b2c3d0] hover:text-white">
                  <Mail className="h-3 w-3" />
                  تواصل معنا
                </span>
              </Link>
            </li>
          </ul>
        </MobileCollapsible>

        {/* Social Icons */}
        <div className="flex flex-wrap items-center justify-center gap-4 my-4">
          {socialLinks.map((s, i) => (
            <a
              key={i}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#b2c3d0] hover:text-white transition-colors"
              aria-label={s.label}
            >
              <s.icon className="h-4 w-4" />
            </a>
          ))}
        </div>

        {/* Copyright */}
        <div className="flex flex-col items-center gap-1 text-center border-t border-[#2a4052] pt-3">
          <p className="text-[11px] text-[#b2c3d0]">
            © {currentYear} سبق الذكية | صُنعت بكل <span className="text-green-600">♥</span> في السعودية
          </p>
        </div>
      </div>

      {/* Desktop Footer - Full Layout */}
      <div className="hidden md:block container mx-auto px-4 py-8">
        
        {/* Main Content */}
        <div className="flex flex-col md:flex-row md:justify-between gap-8 mb-8">
          
          {/* Brand & App Downloads */}
          <div className="flex flex-col gap-4">
            <Link href="/" data-testid="footer-logo">
              <img 
                src={sabqLogo} 
                alt="سبق" 
                className="h-[85px] w-24 object-contain"
                loading="lazy"
                width={96}
                height={85}
                decoding="async"
              />
            </Link>
            <p className="text-sm text-[#b2c3d0] max-w-xs">
              منصة إخبارية سعودية ذكية
            </p>
            
            {/* App Download Icons */}
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-black/80 transition-colors"
                data-testid="footer-link-app-store"
                aria-label="تحميل تطبيق سبق من App Store"
              >
                <SiApple className="w-4 h-4" aria-hidden="true" />
              </a>
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#01875f] text-white text-xs font-medium rounded-lg hover:bg-[#01875f]/90 transition-colors"
                data-testid="footer-link-play-store"
                aria-label="تحميل تطبيق سبق من Google Play"
              >
                <SiGoogleplay className="w-4 h-4" aria-hidden="true" />
              </a>
              <a
                href={HUAWEI_APPGALLERY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#c7112d] text-white text-xs font-medium rounded-lg hover:bg-[#c7112d]/90 transition-colors"
                data-testid="footer-link-huawei-appgallery"
                aria-label="تحميل تطبيق سبق من Huawei AppGallery"
              >
                <SiHuawei className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Categories */}
          <div>
            <h4 className="font-medium text-sm mb-3">التصنيفات</h4>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {mainCategories.map((cat) => (
                <li key={cat.id}>
                  <Link href={`/category/${cat.slug}`}>
                    <span className="text-sm text-[#b2c3d0] hover:text-white transition-colors">
                      {cat.nameAr}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Info Links */}
          <div>
            <h4 className="font-medium text-sm mb-3">معلومات</h4>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {infoLinks.map((link, i) => (
                <li key={i}>
                  <Link href={link.href}>
                    <span className="text-sm text-[#b2c3d0] hover:text-white transition-colors">
                      {link.label}
                    </span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/contact">
                  <span className="inline-flex items-center gap-1 text-sm text-[#b2c3d0] hover:text-white transition-colors">
                    <Mail className="h-3.5 w-3.5" />
                    تواصل معنا
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-[#2a4052]">
          {/* Copyright */}
          <div className="flex flex-col items-center md:items-start gap-1">
            <p className="text-xs text-[#b2c3d0]">
              © {currentYear} سبق الذكية
            </p>
            <p className="text-xs text-[#b2c3d0] flex items-center gap-1">
              صُنعت بكل <span className="text-green-600">♥</span> في السعودية
            </p>
          </div>

          {/* Social */}
          <div className="flex items-center gap-3">
            {socialLinks.map((s, i) => (
              <a
                key={i}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#b2c3d0] hover:text-white transition-colors"
                aria-label={s.label}
              >
                <s.icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll to Top */}
      <button
        onClick={scrollToTop}
        className="fixed bottom-6 left-6 z-50 w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors flex items-center justify-center"
        aria-label="العودة إلى الأعلى"
        data-testid="scroll-to-top"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </footer>
  );
}
