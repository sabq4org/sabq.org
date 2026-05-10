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
    document.title = "سبق سمارٹ - ذہین خبروں کا پلیٹ فارم";
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ur";
    
    // Cleanup: restore defaults when unmounting
    return () => {
      document.documentElement.dir = "ltr";
      document.documentElement.lang = "en";
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
