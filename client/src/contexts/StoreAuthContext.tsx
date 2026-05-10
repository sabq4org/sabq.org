import { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface StoreCustomer {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  companyName: string | null;
  status?: string;
  emailVerified?: boolean;
  totalOrders?: number;
  totalSpent?: number;
}

interface StoreAuthContextType {
  customer: StoreCustomer | null;
  token: string | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  phone?: string;
  companyName?: string;
}

interface AuthResponse {
  success: boolean;
  data?: {
    customer: StoreCustomer;
    token: string;
    expiresAt: string;
  };
  error?: string;
}

const StoreAuthContext = createContext<StoreAuthContextType | undefined>(undefined);

const STORE_TOKEN_KEY = "storeToken";

export function StoreAuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<StoreCustomer | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORE_TOKEN_KEY);
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(true);

  const isLoggedIn = !!customer && !!token;

  const verifyToken = useCallback(async (storedToken: string) => {
    try {
      const response = await fetch("/api/store/auth/me", {
        headers: {
          "X-Store-Token": storedToken,
        },
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.customer) {
          setCustomer(data.data.customer);
          return true;
        }
      }
      
      localStorage.removeItem(STORE_TOKEN_KEY);
      setToken(null);
      setCustomer(null);
      return false;
    } catch (error) {
      console.error("[StoreAuth] Token verification failed:", error);
      localStorage.removeItem(STORE_TOKEN_KEY);
      setToken(null);
      setCustomer(null);
      return false;
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem(STORE_TOKEN_KEY);
      if (storedToken) {
        setToken(storedToken);
        await verifyToken(storedToken);
      }
      setIsLoading(false);
    };

    initAuth();
  }, [verifyToken]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch("/api/store/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data: AuthResponse = await response.json();

      if (data.success && data.data) {
        localStorage.setItem(STORE_TOKEN_KEY, data.data.token);
        setToken(data.data.token);
        setCustomer(data.data.customer);
        return { success: true };
      }

      return { success: false, error: data.error || "فشل تسجيل الدخول" };
    } catch (error: any) {
      console.error("[StoreAuth] Login error:", error);
      return { success: false, error: error.message || "خطأ في الاتصال" };
    }
  };

  const register = async (data: RegisterData): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch("/api/store/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      const result: AuthResponse = await response.json();

      if (result.success && result.data) {
        localStorage.setItem(STORE_TOKEN_KEY, result.data.token);
        setToken(result.data.token);
        setCustomer(result.data.customer);
        return { success: true };
      }

      return { success: false, error: result.error || "فشل إنشاء الحساب" };
    } catch (error: any) {
      console.error("[StoreAuth] Register error:", error);
      return { success: false, error: error.message || "خطأ في الاتصال" };
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch("/api/store/auth/logout", {
          method: "POST",
          headers: {
            "X-Store-Token": token,
          },
          credentials: "include",
        });
      }
    } catch (error) {
      console.error("[StoreAuth] Logout error:", error);
    } finally {
      localStorage.removeItem(STORE_TOKEN_KEY);
      setToken(null);
      setCustomer(null);
    }
  };

  return (
    <StoreAuthContext.Provider
      value={{
        customer,
        token,
        isLoading,
        isLoggedIn,
        login,
        register,
        logout,
      }}
    >
      {children}
    </StoreAuthContext.Provider>
  );
}

export function useStoreAuth() {
  const context = useContext(StoreAuthContext);
  if (!context) {
    throw new Error("useStoreAuth must be used within StoreAuthProvider");
  }
  return context;
}
