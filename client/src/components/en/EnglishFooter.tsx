import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  Facebook,
  Instagram,
  Youtube,
  Linkedin,
  ArrowUp,
  Mail
} from "lucide-react";
import { SiX, SiTiktok, SiWhatsapp } from "react-icons/si";
import sabqLogo from "@assets/sabq-logo.png";

interface Category {
  id: string;
  nameEn: string;
  slug: string;
}

export function EnglishFooter() {
  const currentYear = new Date().getFullYear();

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ['/api/en/categories'],
    staleTime: 5 * 60 * 1000,
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const infoLinks = [
    { label: "About Us", href: "/en/about" },
    { label: "Privacy Policy", href: "/en/privacy" },
    { label: "Terms of Use", href: "/en/terms" },
  ];

  const socialLinks = [
    { icon: SiX, href: "https://x.com/sabqorg", label: "X" },
    { icon: Facebook, href: "https://www.facebook.com/sabq.org", label: "Facebook" },
    { icon: Instagram, href: "https://www.instagram.com/sabqorg", label: "Instagram" },
    { icon: Youtube, href: "https://youtube.com/@sabqorg", label: "YouTube" },
    { icon: SiTiktok, href: "https://www.tiktok.com/@sabqorg", label: "TikTok" },
    { icon: Linkedin, href: "https://www.linkedin.com/in/sabqorg", label: "LinkedIn" },
    { icon: SiWhatsapp, href: "https://whatsapp.com/channel/0029VaCUMDGEAKWA2soRAl02", label: "WhatsApp" },
  ];

  const mainCategories = categories.slice(0, 6);

  return (
    <footer 
      id="footer" 
      className="bg-muted/30 border-t" 
      data-testid="footer" 
      dir="ltr"
    >
      <div className="container mx-auto px-4 py-8">
        
        <div className="flex flex-col md:flex-row md:justify-between gap-8 mb-8">
          
          <div className="flex flex-col gap-3">
            <Link href="/en" data-testid="footer-logo">
              <img 
                src={sabqLogo} 
                alt="Sabq" 
                className="h-8 w-auto"
                loading="lazy"
              />
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">
              Smart Arabic News Platform
            </p>
          </div>

          <div>
            <h4 className="font-medium text-sm mb-3">Categories</h4>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {mainCategories.map((cat) => (
                <li key={cat.id}>
                  <Link href={`/en/category/${cat.slug}`}>
                    <span className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {cat.nameEn}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-sm mb-3">Information</h4>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {infoLinks.map((link, i) => (
                <li key={i}>
                  <Link href={link.href}>
                    <span className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {link.label}
                    </span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/en/contact">
                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Mail className="h-3.5 w-3.5" />
                    Contact Us
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            © {currentYear} Sabq Smart
          </p>

          <div className="flex items-center gap-3">
            {socialLinks.map((s, i) => (
              <a
                key={i}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={s.label}
              >
                <s.icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={scrollToTop}
        className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors flex items-center justify-center"
        aria-label="Back to top"
        data-testid="scroll-to-top"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </footer>
  );
}
