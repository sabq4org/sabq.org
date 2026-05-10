import { ReactNode, useState } from "react";
import { IFoxSidebar } from "./IFoxSidebar";
import { IFoxThemeProvider } from "@/components/IFoxThemeProvider";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface IFoxLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
}

/**
 * RTL-aware layout wrapper for iFox admin pages
 * Ensures sidebar appears on the right side for Arabic interface
 * Applies OKLCH-based modern SaaS theme
 */
export function IFoxLayout({ children, showSidebar = true }: IFoxLayoutProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <IFoxThemeProvider>
      <div 
        className="flex flex-row-reverse h-screen bg-background text-foreground" 
        dir="rtl"
      >
        {/* Desktop Sidebar - Hidden on mobile, visible on lg+ */}
        {showSidebar && <IFoxSidebar className="hidden lg:block" />}
        
        {/* Mobile Sidebar with Overlay */}
        <AnimatePresence>
          {showSidebar && isMobileSidebarOpen && (
            <>
              {/* Backdrop Overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/60 z-40 lg:hidden"
                onClick={() => setIsMobileSidebarOpen(false)}
                data-testid="sidebar-overlay"
              />
              
              {/* Mobile Sidebar */}
              <motion.div
                initial={{ x: 300 }}
                animate={{ x: 0 }}
                exit={{ x: 300 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="fixed top-0 right-0 h-full z-50 lg:hidden"
              >
                <IFoxSidebar 
                  className="h-full" 
                  onClose={() => setIsMobileSidebarOpen(false)}
                  isMobile={true}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
        
        {/* Main content area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Mobile Header with Menu Button */}
          {showSidebar && (
            <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--ifox-surface-overlay))] bg-[hsl(var(--ifox-surface-primary)/.8)] backdrop-blur-lg">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                className="text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.6)]"
                data-testid="button-mobile-menu"
              >
                {isMobileSidebarOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </Button>
              
              <h1 className="text-lg font-bold bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] bg-clip-text text-transparent">
                آي فوكس
              </h1>
              
              {/* Spacer for symmetry */}
              <div className="w-10" />
            </div>
          )}
          
          {/* Page Content */}
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </IFoxThemeProvider>
  );
}
