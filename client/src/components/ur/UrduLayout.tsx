import { ReactNode, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { UrduHeader } from "./UrduHeader";

interface UrduLayoutProps {
  children: ReactNode;
}

interface User {
  id: string;
  email: string;
  name?: string | null;
  role?: string;
  profileImageUrl?: string | null;
}

export function UrduLayout({ children }: UrduLayoutProps) {
  // Set Urdu page title and RTL direction
  useEffect(() => {
    // Restore what was there before, not a hardcoded ltr/en: the site default
    // is rtl/ar and portaled dialogs inherit <html dir> after leaving Urdu.
    const previousDir = document.documentElement.dir;
    const previousLang = document.documentElement.lang;
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ur";

    return () => {
      document.documentElement.dir = previousDir || "rtl";
      document.documentElement.lang = previousLang || "ar";
    };
  }, []);

  // Fetch current user
  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  return (
    <div className="min-h-screen bg-background" dir="rtl" lang="ur">
      <UrduHeader user={user} />
      <main>{children}</main>
    </div>
  );
}
