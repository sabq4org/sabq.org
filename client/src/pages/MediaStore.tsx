import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import sabqLogo from "@assets/sabq-logo.png";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useStoreAuth, StoreAuthProvider } from "@/contexts/StoreAuthContext";
import {
  Twitter,
  Instagram,
  Newspaper,
  Pin,
  Repeat,
  ShoppingCart,
  Search,
  CheckCircle,
  Loader2,
  Clock,
  AlertCircle,
  Megaphone,
  ArrowLeft,
  CreditCard,
  HelpCircle,
  Building2,
  Mail,
  Phone,
  User,
  FileText,
  AtSign,
  MessageSquare,
  Plus,
  Minus,
  Trash2,
  X,
  LogIn,
  LogOut,
  ChevronDown,
  Lock,
  Eye,
  EyeOff,
  Paperclip,
  Image,
  Upload,
} from "lucide-react";

interface MediaService {
  id: string;
  name: string;
  description: string;
  price: number;
  vat: number;
  total: number;
  features: string[];
  icon: string;
  requiresContent: boolean;
  requiresSocialHandle: boolean;
}

interface CartItem {
  service: MediaService;
  quantity: number;
}

interface ServerCartItem {
  id: string;
  customerId: string;
  itemType: string;
  itemId: string;
  itemName: string;
  quantity: number;
  priceHalalas: number;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

interface ServerCartResponse {
  success: boolean;
  data: {
    items: ServerCartItem[];
    itemCount: number;
    totalHalalas: number;
    totalSAR: string;
  };
}

interface OrderResponse {
  orderId: string;
  trackingToken: string;
  paymentUrl: string;
}

interface TrackingResult {
  orderId: string;
  status: string;
  serviceName: string;
  createdAt: string;
  paidAt?: string;
  completedAt?: string;
  customerName: string;
}

const orderFormSchema = z.object({
  customerName: z.string().min(2, "الاسم مطلوب"),
  customerEmail: z.string().email("البريد الإلكتروني غير صحيح"),
  customerPhone: z.string().optional(),
  companyName: z.string().optional(),
  contentTitle: z.string().optional(),
  contentBody: z.string().optional(),
  socialHandle: z.string().optional(),
  notes: z.string().optional(),
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

const loginFormSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

const registerFormSchema = z.object({
  name: z.string().min(2, "الاسم مطلوب"),
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
  phone: z.string().optional(),
  companyName: z.string().optional(),
});

type RegisterFormValues = z.infer<typeof registerFormSchema>;

const serviceIcons: Record<string, typeof Twitter> = {
  twitter: Twitter,
  instagram: Instagram,
  newspaper: Newspaper,
  pin: Pin,
  repeat: Repeat,
};

const getServiceIcon = (iconName: string) => {
  return serviceIcons[iconName] || Newspaper;
};

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "في انتظار الدفع", color: "bg-yellow-500" },
  paid: { label: "تم الدفع", color: "bg-blue-500" },
  processing: { label: "قيد التنفيذ", color: "bg-purple-500" },
  completed: { label: "مكتمل", color: "bg-green-500" },
  cancelled: { label: "ملغي", color: "bg-red-500" },
};

function MediaStoreContent() {
  const [selectedService, setSelectedService] = useState<MediaService | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCartCheckout, setIsCartCheckout] = useState(false);
  const [localCart, setLocalCart] = useState<CartItem[]>([]);
  const [trackingToken, setTrackingToken] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(false);
  const [isSyncingCart, setIsSyncingCart] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevIsLoggedInRef = useRef<boolean | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { customer, token, isLoading: isAuthLoading, isLoggedIn, login, register, logout } = useStoreAuth();

  useEffect(() => {
    document.title = "متجر الخدمات الإعلامية - سبق";
  }, []);

  const { data: servicesResponse, isLoading: isLoadingServices } = useQuery<{ success: boolean; data: any[] }>({
    queryKey: ["/api/media-store/services"],
  });
  
  const services: MediaService[] = (servicesResponse?.data || []).map((s: any) => {
    const vat = Math.round(s.priceHalalas * 0.15);
    const total = s.priceHalalas + vat;
    return {
      id: s.id,
      name: s.nameAr,
      description: s.descriptionAr,
      price: s.priceHalalas / 100,
      vat: vat / 100,
      total: total / 100,
      features: s.features || [],
      icon: (s.icon || "newspaper").toLowerCase(),
      requiresContent: s.type === "press_release",
      requiresSocialHandle: s.type !== "press_release",
    };
  });

  const { data: serverCartResponse, isLoading: isLoadingServerCart, refetch: refetchServerCart } = useQuery<ServerCartResponse>({
    queryKey: ["/api/store/cart"],
    queryFn: async () => {
      const response = await fetch("/api/store/cart", {
        headers: {
          "X-Store-Token": token || "",
        },
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch cart");
      }
      return response.json();
    },
    enabled: isLoggedIn && !!token,
    staleTime: 30000,
  });

  const serverCartToLocalCart = useCallback((serverItems: ServerCartItem[]): CartItem[] => {
    return serverItems.map((item) => {
      const service = services.find((s) => s.id === item.itemId);
      if (!service) {
        const vat = Math.round(item.priceHalalas * 0.15);
        const total = item.priceHalalas + vat;
        return {
          service: {
            id: item.itemId,
            name: item.itemName,
            description: "",
            price: item.priceHalalas / 100,
            vat: vat / 100,
            total: total / 100,
            features: [],
            icon: "newspaper",
            requiresContent: false,
            requiresSocialHandle: false,
          },
          quantity: item.quantity,
        };
      }
      return {
        service,
        quantity: item.quantity,
      };
    });
  }, [services]);

  const serverCart = serverCartResponse?.data?.items || [];
  const cart: CartItem[] = isLoggedIn 
    ? serverCartToLocalCart(serverCart)
    : localCart;

  const addToCartMutation = useMutation({
    mutationFn: async (service: MediaService) => {
      const response = await fetch("/api/store/cart/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Store-Token": token || "",
        },
        credentials: "include",
        body: JSON.stringify({
          itemType: "media_service",
          itemId: service.id,
          itemName: service.name,
          quantity: 1,
          priceHalalas: Math.round(service.price * 100),
          metadata: {
            icon: service.icon,
            features: service.features,
            requiresContent: service.requiresContent,
            requiresSocialHandle: service.requiresSocialHandle,
          },
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add to cart");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/store/cart"] });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إضافة الخدمة للسلة",
        variant: "destructive",
      });
    },
  });

  const updateCartItemMutation = useMutation({
    mutationFn: async ({ cartItemId, quantity }: { cartItemId: string; quantity: number }) => {
      const response = await fetch(`/api/store/cart/items/${cartItemId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Store-Token": token || "",
        },
        credentials: "include",
        body: JSON.stringify({ quantity }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update cart item");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/store/cart"] });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الكمية",
        variant: "destructive",
      });
    },
  });

  const removeCartItemMutation = useMutation({
    mutationFn: async (cartItemId: string) => {
      const response = await fetch(`/api/store/cart/items/${cartItemId}`, {
        method: "DELETE",
        headers: {
          "X-Store-Token": token || "",
        },
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to remove cart item");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/store/cart"] });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف العنصر",
        variant: "destructive",
      });
    },
  });

  const syncLocalCartToServer = useCallback(async () => {
    if (!token || localCart.length === 0) return;
    
    setIsSyncingCart(true);
    try {
      for (const item of localCart) {
        const response = await fetch("/api/store/cart/items", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Store-Token": token,
          },
          credentials: "include",
          body: JSON.stringify({
            itemType: "media_service",
            itemId: item.service.id,
            itemName: item.service.name,
            quantity: item.quantity,
            priceHalalas: Math.round(item.service.price * 100),
            metadata: {
              icon: item.service.icon,
              features: item.service.features,
              requiresContent: item.service.requiresContent,
              requiresSocialHandle: item.service.requiresSocialHandle,
            },
          }),
        });
        if (!response.ok) {
          console.error("[Cart] Failed to sync item:", item.service.name);
        }
      }
      setLocalCart([]);
      await refetchServerCart();
      if (localCart.length > 0) {
        toast({
          title: "تم مزامنة السلة",
          description: "تمت إضافة عناصر السلة المحلية إلى حسابك",
        });
      }
    } catch (error) {
      console.error("[Cart] Failed to sync local cart to server:", error);
      toast({
        title: "خطأ في مزامنة السلة",
        description: "فشل في مزامنة السلة مع الخادم",
        variant: "destructive",
      });
    } finally {
      setIsSyncingCart(false);
    }
  }, [token, localCart, refetchServerCart, toast]);

  useEffect(() => {
    if (prevIsLoggedInRef.current === false && isLoggedIn && token) {
      syncLocalCartToServer();
    }
    if (prevIsLoggedInRef.current === true && !isLoggedIn) {
      setLocalCart([]);
      queryClient.removeQueries({ queryKey: ["/api/store/cart"] });
    }
    prevIsLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn, token, syncLocalCartToServer, queryClient]);

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      companyName: "",
      contentTitle: "",
      contentBody: "",
      socialHandle: "",
      notes: "",
    },
  });

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      phone: "",
      companyName: "",
    },
  });

  useEffect(() => {
    if (isLoggedIn && customer) {
      form.reset({
        customerName: customer.name || "",
        customerEmail: customer.email || "",
        customerPhone: customer.phone || "",
        companyName: customer.companyName || "",
        contentTitle: "",
        contentBody: "",
        socialHandle: "",
        notes: "",
      });
    }
  }, [isLoggedIn, customer]);

  useEffect(() => {
    if (pendingCheckout && isLoggedIn) {
      setPendingCheckout(false);
      setIsCheckoutOpen(true);
    }
  }, [pendingCheckout, isLoggedIn]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setAttachments(prev => [...prev, ...newFiles]);
    }
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const createOrderMutation = useMutation({
    mutationFn: async (data: OrderFormValues & { serviceId: string }) => {
      return await apiRequest<OrderResponse>("/api/media-store/orders", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (response) => {
      toast({
        title: "تم إنشاء الطلب",
        description: "سيتم توجيهك إلى صفحة الدفع",
      });
      setIsCheckoutOpen(false);
      setIsCartCheckout(false);
      form.reset();
      window.location.href = response.paymentUrl;
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء الطلب",
        variant: "destructive",
      });
    },
  });

  const createCartOrderMutation = useMutation({
    mutationFn: async (data: { 
      items: { serviceId: string; quantity: number }[];
      customerName: string;
      customerEmail: string;
      customerPhone?: string;
      customerCompany?: string;
      additionalNotes?: string;
    }) => {
      return await apiRequest<OrderResponse>("/api/media-store/orders/cart", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (response) => {
      toast({
        title: "تم إنشاء الطلب",
        description: "سيتم توجيهك إلى صفحة الدفع",
      });
      setIsCheckoutOpen(false);
      setIsCartCheckout(false);
      setLocalCart([]);
      if (isLoggedIn) {
        queryClient.invalidateQueries({ queryKey: ["/api/store/cart"] });
      }
      form.reset();
      window.location.href = response.paymentUrl;
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء الطلب",
        variant: "destructive",
      });
    },
  });

  const { data: trackingResult, refetch: trackOrder } = useQuery<TrackingResult>({
    queryKey: ["/api/media-store/orders/track", trackingToken],
    enabled: false,
  });

  const addToCart = (service: MediaService) => {
    if (isLoggedIn && token) {
      addToCartMutation.mutate(service, {
        onSuccess: () => {
          toast({
            title: "تمت الإضافة للسلة",
            description: `تم إضافة "${service.name}" إلى سلة التسوق`,
          });
        },
      });
    } else {
      setLocalCart(prevCart => {
        const existingItem = prevCart.find(item => item.service.id === service.id);
        if (existingItem) {
          return prevCart.map(item =>
            item.service.id === service.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        }
        return [...prevCart, { service, quantity: 1 }];
      });
      toast({
        title: "تمت الإضافة للسلة",
        description: `تم إضافة "${service.name}" إلى سلة التسوق`,
      });
    }
  };

  const removeFromCart = (serviceId: string) => {
    if (isLoggedIn && token) {
      const serverItem = serverCart.find(item => item.itemId === serviceId);
      if (serverItem) {
        removeCartItemMutation.mutate(serverItem.id);
      }
    } else {
      setLocalCart(prevCart => prevCart.filter(item => item.service.id !== serviceId));
    }
  };

  const updateQuantity = (serviceId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      removeFromCart(serviceId);
      return;
    }
    if (isLoggedIn && token) {
      const serverItem = serverCart.find(item => item.itemId === serviceId);
      if (serverItem) {
        updateCartItemMutation.mutate({ cartItemId: serverItem.id, quantity: newQuantity });
      }
    } else {
      setLocalCart(prevCart =>
        prevCart.map(item =>
          item.service.id === serviceId
            ? { ...item, quantity: newQuantity }
            : item
        )
      );
    }
  };

  const getCartTotals = () => {
    const subtotal = cart.reduce((sum, item) => sum + item.service.price * item.quantity, 0);
    const vat = cart.reduce((sum, item) => sum + item.service.vat * item.quantity, 0);
    const total = cart.reduce((sum, item) => sum + item.service.total * item.quantity, 0);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    return { subtotal, vat, total, itemCount };
  };

  const handleOrderNow = (service: MediaService) => {
    setSelectedService(service);
    setIsCartCheckout(false);
    if (isLoggedIn && customer) {
      form.reset({
        customerName: customer.name || "",
        customerEmail: customer.email || "",
        customerPhone: customer.phone || "",
        companyName: customer.companyName || "",
        contentTitle: "",
        contentBody: "",
        socialHandle: "",
        notes: "",
      });
      setIsCheckoutOpen(true);
    } else {
      form.reset();
      setPendingCheckout(true);
      setIsAuthDialogOpen(true);
    }
  };

  const handleCartCheckout = () => {
    if (cart.length === 0) {
      toast({
        title: "السلة فارغة",
        description: "يرجى إضافة خدمات إلى السلة أولاً",
        variant: "destructive",
      });
      return;
    }
    setIsCartCheckout(true);
    setSelectedService(cart[0].service);
    setIsCartOpen(false);
    if (isLoggedIn && customer) {
      form.reset({
        customerName: customer.name || "",
        customerEmail: customer.email || "",
        customerPhone: customer.phone || "",
        companyName: customer.companyName || "",
        contentTitle: "",
        contentBody: "",
        socialHandle: "",
        notes: "",
      });
      setIsCheckoutOpen(true);
    } else {
      form.reset();
      setPendingCheckout(true);
      setIsAuthDialogOpen(true);
    }
  };

  const handleLogin = async (values: LoginFormValues) => {
    setIsAuthSubmitting(true);
    try {
      const result = await login(values.email, values.password);
      if (result.success) {
        toast({
          title: "تم تسجيل الدخول",
          description: "مرحباً بك مجدداً",
        });
        loginForm.reset();
        setIsAuthDialogOpen(false);
      } else {
        toast({
          title: "خطأ في تسجيل الدخول",
          description: result.error || "البريد الإلكتروني أو كلمة المرور غير صحيحة",
          variant: "destructive",
        });
      }
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleRegister = async (values: RegisterFormValues) => {
    setIsAuthSubmitting(true);
    try {
      const result = await register({
        name: values.name,
        email: values.email,
        password: values.password,
        phone: values.phone || undefined,
        companyName: values.companyName || undefined,
      });
      if (result.success) {
        toast({
          title: "تم إنشاء الحساب",
          description: "مرحباً بك في متجر سبق للخدمات الإعلامية",
        });
        registerForm.reset();
        setIsAuthDialogOpen(false);
      } else {
        toast({
          title: "خطأ في إنشاء الحساب",
          description: result.error || "فشل إنشاء الحساب",
          variant: "destructive",
        });
      }
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast({
      title: "تم تسجيل الخروج",
      description: "نراك قريباً",
    });
  };

  const openAuthDialog = (tab: "login" | "register" = "login") => {
    setAuthTab(tab);
    setIsAuthDialogOpen(true);
  };

  const handleSubmitOrder = (values: OrderFormValues) => {
    if (isCartCheckout) {
      if (cart.length === 0) return;
      
      // Use the cart order endpoint for multiple items
      createCartOrderMutation.mutate({
        items: cart.map(item => ({
          serviceId: item.service.id,
          quantity: item.quantity,
        })),
        customerName: values.customerName,
        customerEmail: values.customerEmail,
        customerPhone: values.customerPhone || undefined,
        customerCompany: values.companyName || undefined,
        additionalNotes: values.notes || undefined,
      });
    } else {
      if (!selectedService) return;
      if (selectedService.requiresContent && (!values.contentTitle || !values.contentBody)) {
        toast({
          title: "بيانات ناقصة",
          description: "يرجى إدخال عنوان ومحتوى البيان",
          variant: "destructive",
        });
        return;
      }
      if (selectedService.requiresSocialHandle && !values.socialHandle) {
        toast({
          title: "بيانات ناقصة",
          description: "يرجى إدخال اسم الحساب",
          variant: "destructive",
        });
        return;
      }
      createOrderMutation.mutate({
        ...values,
        serviceId: selectedService.id,
      });
    }
  };

  const handleTrackOrder = async () => {
    if (!trackingToken.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال رمز التتبع",
        variant: "destructive",
      });
      return;
    }
    setIsTracking(true);
    try {
      await trackOrder();
    } finally {
      setIsTracking(false);
    }
  };

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat("en-US").format(amount) + " ر.س";
  };

  const formatPriceFromRiyals = (amount: number) => {
    return new Intl.NumberFormat("en-US").format(amount) + " ر.س";
  };

  const { subtotal, vat, total, itemCount } = getCartTotals();

  const faqItems = [
    {
      question: "ما هي خدمة نشر البيان الصحفي؟",
      answer: "خدمة نشر البيان الصحفي تتيح لك نشر بيانك الصحفي على موقع سبق الإخباري مع تنسيق احترافي وإضافة الوسائط المناسبة. يتم مراجعة البيان من فريق التحرير قبل النشر لضمان الجودة.",
    },
    {
      question: "كيف تعمل خدمة النشر على تويتر/إكس؟",
      answer: "نقوم بنشر محتواك على حساب سبق الرسمي على منصة إكس (تويتر) الذي يتابعه ملايين المستخدمين. يمكنك تحديد التوقيت المناسب للنشر وسنقوم بتنسيق المحتوى بشكل احترافي.",
    },
    {
      question: "ما الفرق بين النشر العادي والنشر المثبت؟",
      answer: "النشر المثبت يعني أن منشورك سيظهر في أعلى صفحة الحساب لمدة محددة، مما يضمن رؤية أكبر من المتابعين. النشر العادي يظهر في التايم لاين بشكل طبيعي.",
    },
    {
      question: "كم يستغرق تنفيذ الطلب؟",
      answer: "يتم تنفيذ معظم الطلبات خلال 24-48 ساعة عمل بعد تأكيد الدفع. في حال الحاجة لنشر عاجل، يرجى التواصل معنا مباشرة.",
    },
    {
      question: "هل يمكنني تعديل المحتوى بعد إرسال الطلب؟",
      answer: "نعم، يمكنك التواصل معنا لتعديل المحتوى قبل النشر. بعد النشر، تكون التعديلات محدودة حسب سياسة المنصة.",
    },
    {
      question: "ما هي طرق الدفع المتاحة؟",
      answer: "نقبل الدفع عبر بطاقات الائتمان (فيزا، ماستركارد)، مدى، وApple Pay عبر بوابة Tap للدفع الآمن.",
    },
  ];

  const getCheckoutService = () => {
    if (isCartCheckout && cart.length > 0) {
      return cart[0].service;
    }
    return selectedService;
  };

  const getCheckoutPricing = () => {
    if (isCartCheckout) {
      return {
        price: subtotal,
        vat: vat,
        total: total,
      };
    }
    return selectedService ? {
      price: selectedService.price,
      vat: selectedService.vat,
      total: selectedService.total,
    } : null;
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-gradient-to-l from-primary/5 via-background to-background border-b shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <img 
              src={sabqLogo} 
              alt="سبق" 
              className="h-10"
              data-testid="img-store-logo"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => setIsCartOpen(true)}
              data-testid="button-header-cart"
            >
              <ShoppingCart className="h-5 w-5" />
              {itemCount > 0 && (
                <Badge 
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs font-medium bg-primary text-primary-foreground"
                  data-testid="badge-cart-count"
                >
                  {itemCount}
                </Badge>
              )}
            </Button>
            
            {isAuthLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" data-testid="loader-auth" />
            ) : isLoggedIn && customer ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="gap-2"
                    data-testid="button-user-menu"
                  >
                    <User className="h-4 w-4" />
                    <span data-testid="text-welcome-user">مرحباً {customer.name}</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={handleLogout}
                    className="gap-2 cursor-pointer"
                    data-testid="button-logout"
                  >
                    <LogOut className="h-4 w-4" />
                    تسجيل الخروج
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                className="gap-2"
                onClick={() => openAuthDialog("login")}
                data-testid="button-login"
              >
                <LogIn className="h-4 w-4" />
                تسجيل الدخول
              </Button>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent/10 py-16 lg:py-24">
        <div className="absolute inset-0 bg-[url('/assets/pattern.svg')] opacity-5" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-6">
              <Megaphone className="h-5 w-5" />
              <span className="text-sm font-medium">خدمات إعلامية متكاملة</span>
            </div>
            <h1 
              className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6"
              data-testid="text-hero-title"
            >
              متجر الخدمات الإعلامية
            </h1>
            <p 
              className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed"
              data-testid="text-hero-description"
            >
              انشر بياناتك الصحفية ومنشوراتك على منصات سبق الإخبارية وحساباتها على وسائل التواصل الاجتماعي
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="gap-2"
                onClick={() => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="button-view-services"
              >
                <ShoppingCart className="h-5 w-5" />
                تصفح الخدمات
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="gap-2"
                onClick={() => document.getElementById("tracking")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="button-track-order"
              >
                <Search className="h-5 w-5" />
                تتبع طلبك
              </Button>
            </div>
          </div>
        </div>
      </section>

      {isCheckoutOpen ? (
        <section id="checkout" className="py-12 lg:py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto">
              <Button
                variant="ghost"
                className="mb-6 gap-2"
                onClick={() => {
                  setIsCheckoutOpen(false);
                  setSelectedService(null);
                  setIsCartCheckout(false);
                  setAttachments([]);
                  form.reset();
                }}
                data-testid="button-back-to-services"
              >
                <ArrowLeft className="h-4 w-4" />
                العودة للخدمات
              </Button>
              
              <Card className="border-2">
                <CardHeader className="text-center pb-4 border-b">
                  <CardTitle className="flex items-center justify-center gap-2 text-xl">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                    إتمام الطلب
                  </CardTitle>
                  <CardDescription>
                    {isCartCheckout 
                      ? `طلب ${cart.length} خدمة من السلة`
                      : selectedService?.name
                    }
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="pt-6">
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmitOrder)} className="space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="customerName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2 text-sm">
                                <User className="h-4 w-4 text-muted-foreground" />
                                الاسم الكامل *
                              </FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="أدخل اسمك الكامل" 
                                  className="text-right"
                                  {...field} 
                                  data-testid="input-customer-name"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="customerEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2 text-sm">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                البريد الإلكتروني *
                              </FormLabel>
                              <FormControl>
                                <Input 
                                  type="email"
                                  placeholder="example@domain.com" 
                                  className="text-right"
                                  dir="ltr"
                                  {...field} 
                                  data-testid="input-customer-email"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="customerPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2 text-sm">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                رقم الجوال (اختياري)
                              </FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="05xxxxxxxx" 
                                  className="text-right"
                                  dir="ltr"
                                  {...field} 
                                  data-testid="input-customer-phone"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="companyName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2 text-sm">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                اسم الشركة (اختياري)
                              </FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="اسم الشركة أو المؤسسة" 
                                  className="text-right"
                                  {...field} 
                                  data-testid="input-company-name"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {(getCheckoutService()?.requiresContent) && (
                        <FormField
                          control={form.control}
                          name="contentBody"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2 text-sm">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                نص البيان الصحفي *
                              </FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder="اكتب نص البيان الصحفي هنا..."
                                  className="min-h-[150px] text-right resize-y"
                                  {...field}
                                  data-testid="input-content"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {(getCheckoutService()?.requiresSocialHandle) && (
                        <FormField
                          control={form.control}
                          name="socialHandle"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2 text-sm">
                                <AtSign className="h-4 w-4 text-muted-foreground" />
                                معرف الحساب *
                              </FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="@username"
                                  dir="ltr"
                                  className="text-right"
                                  {...field}
                                  data-testid="input-social-handle"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      <div className="space-y-3">
                        <Label className="flex items-center gap-2 text-sm">
                          <Paperclip className="h-4 w-4 text-muted-foreground" />
                          إرفاق ملفات وصور (اختياري)
                        </Label>
                        <div 
                          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            اضغط لاختيار الملفات أو اسحبها هنا
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            صور، PDF، مستندات Word
                          </p>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/*,.pdf,.doc,.docx"
                          className="hidden"
                          onChange={handleFileSelect}
                          data-testid="input-file-attachment"
                        />
                        
                        {attachments.length > 0 && (
                          <div className="space-y-2 mt-3">
                            {attachments.map((file, index) => (
                              <div 
                                key={index}
                                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {file.type.startsWith("image/") ? (
                                    <Image className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                  ) : (
                                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                  )}
                                  <span className="text-sm truncate">{file.name}</span>
                                  <span className="text-xs text-muted-foreground flex-shrink-0">
                                    ({(file.size / 1024).toFixed(1)} KB)
                                  </span>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 flex-shrink-0"
                                  onClick={() => removeAttachment(index)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2 text-sm">
                              <MessageSquare className="h-4 w-4 text-muted-foreground" />
                              ملاحظات إضافية (اختياري)
                            </FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="أي ملاحظات أو تعليمات خاصة..."
                                className="min-h-[80px] text-right resize-y"
                                {...field}
                                data-testid="input-notes"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Separator className="my-6" />

                      {isCartCheckout ? (
                        <div className="bg-muted/50 p-5 rounded-xl space-y-3">
                          <h4 className="font-semibold mb-4">تفاصيل السعر</h4>
                          {cart.map((item, index) => (
                            <div key={index} className="flex justify-between text-sm">
                              <span className="text-muted-foreground">{item.service.name} × {item.quantity}</span>
                              <span>{formatPriceFromRiyals(item.service.total * item.quantity)}</span>
                            </div>
                          ))}
                          <Separator />
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">المجموع الفرعي:</span>
                            <span>{formatPriceFromRiyals(subtotal)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">ضريبة القيمة المضافة (15%):</span>
                            <span>{formatPriceFromRiyals(vat)}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between font-bold text-lg pt-2">
                            <span>الإجمالي:</span>
                            <span className="text-primary">{formatPriceFromRiyals(total)}</span>
                          </div>
                        </div>
                      ) : selectedService && (
                        <div className="bg-muted/50 p-5 rounded-xl space-y-3">
                          <h4 className="font-semibold mb-4">تفاصيل السعر</h4>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">السعر الأساسي:</span>
                            <span>{formatPrice(selectedService.price)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">ضريبة القيمة المضافة (15%):</span>
                            <span>{formatPrice(selectedService.vat)}</span>
                          </div>
                          <Separator />
                          <div className="flex justify-between font-bold text-lg pt-2">
                            <span>الإجمالي:</span>
                            <span className="text-primary">{formatPrice(selectedService.total)}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <Button 
                          type="button" 
                          variant="outline" 
                          className="flex-1"
                          onClick={() => {
                            setIsCheckoutOpen(false);
                            setSelectedService(null);
                            setIsCartCheckout(false);
                            setAttachments([]);
                            form.reset();
                          }}
                          data-testid="button-cancel-checkout"
                        >
                          إلغاء
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={createOrderMutation.isPending || createCartOrderMutation.isPending}
                          className="flex-1 gap-2"
                          data-testid="button-proceed-payment"
                        >
                          {(createOrderMutation.isPending || createCartOrderMutation.isPending) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CreditCard className="h-4 w-4" />
                          )}
                          متابعة للدفع
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      ) : (
        <section id="services" className="py-16 lg:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 
                className="text-2xl md:text-3xl font-bold text-foreground mb-4"
                data-testid="text-services-title"
              >
                خدماتنا الإعلامية
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                اختر الخدمة المناسبة لاحتياجاتك وابدأ في الوصول إلى جمهورك المستهدف
              </p>
            </div>

            {isLoadingServices ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {services.map((service) => {
                const IconComponent = getServiceIcon(service.icon);
                const cartItem = cart.find(item => item.service.id === service.id);
                return (
                  <Card 
                    key={service.id} 
                    className="flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-2 border-transparent hover:border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 relative overflow-visible"
                    data-testid={`card-service-${service.id}`}
                  >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-l from-primary via-primary/70 to-primary/40 rounded-t-lg" />
                    <CardHeader className="pt-6">
                      <div className="flex items-start justify-between gap-2">
                        <div className="rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 p-4 w-fit shadow-sm">
                          <IconComponent className="h-7 w-7 text-primary" />
                        </div>
                        <Badge variant="secondary" className="text-xs font-medium shadow-sm">
                          شامل الضريبة
                        </Badge>
                      </div>
                      <CardTitle className="text-xl mt-5 font-bold" data-testid={`text-service-name-${service.id}`}>
                        {service.name}
                      </CardTitle>
                      <CardDescription className="leading-relaxed" data-testid={`text-service-description-${service.id}`}>
                        {service.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <div className="mb-6 p-4 bg-gradient-to-l from-primary/10 to-transparent rounded-xl">
                        <div className="flex items-baseline gap-2">
                          <span 
                            className="text-3xl font-bold bg-gradient-to-l from-primary to-primary/70 bg-clip-text text-transparent"
                            data-testid={`text-service-total-${service.id}`}
                          >
                            {formatPrice(service.total)}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1">
                          <span data-testid={`text-service-price-${service.id}`}>
                            السعر: {formatPrice(service.price)}
                          </span>
                          <span>+</span>
                          <span data-testid={`text-service-vat-${service.id}`}>
                            ضريبة: {formatPrice(service.vat)}
                          </span>
                        </div>
                      </div>
                      <ul className="space-y-3">
                        {service.features.map((feature, index) => (
                          <li key={index} className="flex items-start gap-3 text-sm text-muted-foreground">
                            <div className="rounded-full bg-green-500/10 p-1 mt-0.5">
                              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                            </div>
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-3 pt-4 pb-6">
                      <Button 
                        className="w-full gap-2 h-12 text-base font-semibold shadow-md hover:shadow-lg transition-shadow"
                        onClick={() => handleOrderNow(service)}
                        data-testid={`button-order-${service.id}`}
                      >
                        <CreditCard className="h-5 w-5" />
                        اطلب الآن
                      </Button>
                      <Button 
                        variant="outline"
                        className="w-full gap-2 h-11 border-2 hover:bg-primary/5 transition-colors"
                        onClick={() => addToCart(service)}
                        data-testid={`button-add-to-cart-${service.id}`}
                      >
                        <Plus className="h-4 w-4" />
                        أضف للسلة
                        {cartItem && (
                          <Badge variant="default" className="mr-2 bg-primary/90" data-testid={`badge-cart-quantity-${service.id}`}>
                            {cartItem.quantity}
                          </Badge>
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>
      )}

      <section id="tracking" className="py-16 lg:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-8">
              <h2 
                className="text-2xl md:text-3xl font-bold text-foreground mb-4"
                data-testid="text-tracking-title"
              >
                تتبع طلبك
              </h2>
              <p className="text-muted-foreground">
                أدخل رمز التتبع الذي استلمته عبر البريد الإلكتروني لمعرفة حالة طلبك
              </p>
            </div>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    placeholder="أدخل رمز التتبع"
                    value={trackingToken}
                    onChange={(e) => setTrackingToken(e.target.value)}
                    className="flex-1"
                    data-testid="input-tracking-token"
                  />
                  <Button 
                    onClick={handleTrackOrder}
                    disabled={isTracking}
                    className="gap-2"
                    data-testid="button-submit-tracking"
                  >
                    {isTracking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    تتبع
                  </Button>
                </div>

                {trackingResult && (
                  <div className="mt-6 p-4 bg-muted rounded-lg" data-testid="tracking-result">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">حالة الطلب</h3>
                      <Badge 
                        className={statusLabels[trackingResult.status]?.color || "bg-gray-500"}
                        data-testid="badge-order-status"
                      >
                        {statusLabels[trackingResult.status]?.label || trackingResult.status}
                      </Badge>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">رقم الطلب:</span>
                        <span className="font-medium" data-testid="text-order-id">{trackingResult.orderId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">الخدمة:</span>
                        <span className="font-medium" data-testid="text-order-service">{trackingResult.serviceName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">تاريخ الإنشاء:</span>
                        <span className="font-medium" data-testid="text-order-date">
                          {new Date(trackingResult.createdAt).toLocaleDateString("ar-SA-u-ca-gregory")}
                        </span>
                      </div>
                      {trackingResult.completedAt && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">تاريخ الإنجاز:</span>
                          <span className="font-medium text-green-600">
                            {new Date(trackingResult.completedAt).toLocaleDateString("ar-SA-u-ca-gregory")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="faq" className="py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
                <HelpCircle className="h-5 w-5" />
                <span className="text-sm font-medium">أسئلة شائعة</span>
              </div>
              <h2 
                className="text-2xl md:text-3xl font-bold text-foreground mb-4"
                data-testid="text-faq-title"
              >
                الأسئلة المتكررة
              </h2>
              <p className="text-muted-foreground">
                إجابات على أكثر الأسئلة شيوعاً حول خدماتنا الإعلامية
              </p>
            </div>
            
            <Accordion type="single" collapsible className="w-full">
              {faqItems.map((item, index) => (
                <AccordionItem 
                  key={index} 
                  value={`item-${index}`}
                  data-testid={`faq-item-${index}`}
                >
                  <AccordionTrigger className="text-right" data-testid={`faq-question-${index}`}>
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground" data-testid={`faq-answer-${index}`}>
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
        <DialogContent dir="rtl" className="max-w-lg sm:max-h-[85vh] flex flex-col" data-testid="dialog-cart">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              سلة التسوق
              {itemCount > 0 && (
                <Badge variant="secondary" data-testid="badge-cart-total-items">
                  {itemCount} عنصر
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              راجع الخدمات المختارة قبل المتابعة للدفع
            </DialogDescription>
          </DialogHeader>

          {cart.length === 0 ? (
            <div className="py-12 text-center" data-testid="cart-empty-state">
              <ShoppingCart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-lg">سلة التسوق فارغة</p>
              <p className="text-sm text-muted-foreground mt-2">أضف خدمات للسلة للمتابعة</p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                {cart.map((item) => {
                  const IconComponent = getServiceIcon(item.service.icon);
                  return (
                    <div 
                      key={item.service.id} 
                      className="flex items-start gap-4 p-4 bg-muted rounded-lg"
                      data-testid={`cart-item-${item.service.id}`}
                    >
                      <div className="rounded-full bg-primary/10 p-2 shrink-0">
                        <IconComponent className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm" data-testid={`cart-item-name-${item.service.id}`}>
                          {item.service.name}
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1" data-testid={`cart-item-price-${item.service.id}`}>
                          {formatPriceFromRiyals(item.service.total)} × {item.quantity}
                        </p>
                        <p className="text-sm font-semibold text-primary mt-1" data-testid={`cart-item-total-${item.service.id}`}>
                          {formatPriceFromRiyals(item.service.total * item.quantity)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            onClick={() => updateQuantity(item.service.id, item.quantity - 1)}
                            data-testid={`button-decrease-quantity-${item.service.id}`}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span 
                            className="w-8 text-center font-medium"
                            data-testid={`text-quantity-${item.service.id}`}
                          >
                            {item.quantity}
                          </span>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            onClick={() => updateQuantity(item.service.id, item.quantity + 1)}
                            data-testid={`button-increase-quantity-${item.service.id}`}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => removeFromCart(item.service.id)}
                          data-testid={`button-remove-item-${item.service.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex-shrink-0 pt-4 space-y-4">
                <Separator />

                <div className="space-y-2" data-testid="cart-summary">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">المجموع الفرعي:</span>
                    <span data-testid="cart-subtotal">{formatPriceFromRiyals(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ضريبة القيمة المضافة (١٥٪):</span>
                    <span data-testid="cart-vat">{formatPriceFromRiyals(vat)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>الإجمالي:</span>
                    <span className="text-primary" data-testid="cart-total">{formatPriceFromRiyals(total)}</span>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsCartOpen(false)}
                    data-testid="button-continue-shopping"
                  >
                    متابعة التسوق
                  </Button>
                  <Button 
                    onClick={handleCartCheckout}
                    className="gap-2"
                    data-testid="button-cart-checkout"
                  >
                    <CreditCard className="h-4 w-4" />
                    متابعة للدفع
                  </Button>
                </DialogFooter>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      <Dialog open={isAuthDialogOpen} onOpenChange={(open) => {
        setIsAuthDialogOpen(open);
        if (!open) {
          setPendingCheckout(false);
          setShowPassword(false);
          loginForm.reset();
          registerForm.reset();
        }
      }}>
        <DialogContent className="max-w-md" dir="rtl" data-testid="dialog-auth">
          <DialogHeader className="text-center pb-2">
            <DialogTitle className="flex items-center justify-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" />
              {pendingCheckout ? "يرجى تسجيل الدخول للمتابعة" : "تسجيل الدخول / إنشاء حساب"}
            </DialogTitle>
            <DialogDescription className="text-center text-sm">
              {pendingCheckout 
                ? "لإتمام عملية الشراء، يرجى تسجيل الدخول أو إنشاء حساب جديد"
                : "قم بتسجيل الدخول إلى حسابك أو أنشئ حساباً جديداً"
              }
            </DialogDescription>
          </DialogHeader>

          <Tabs value={authTab} onValueChange={(v) => setAuthTab(v as "login" | "register")} className="w-full" dir="rtl">
            <TabsList className="grid w-full grid-cols-2 h-11 p-1 rounded-lg">
              <TabsTrigger value="register" className="rounded-md text-sm font-medium" data-testid="tab-register">إنشاء حساب</TabsTrigger>
              <TabsTrigger value="login" className="rounded-md text-sm font-medium" data-testid="tab-login">تسجيل الدخول</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login" className="space-y-4 mt-4">
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          البريد الإلكتروني
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="email"
                            placeholder="example@domain.com" 
                            className="text-right"
                            dir="ltr"
                            {...field}
                            data-testid="input-login-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2 text-sm">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                          كلمة المرور
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              type={showPassword ? "text" : "password"}
                              placeholder="أدخل كلمة المرور"
                              className="text-right pe-10"
                              {...field}
                              data-testid="input-login-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute start-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowPassword(!showPassword)}
                              data-testid="button-toggle-password"
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full gap-2"
                    disabled={isAuthSubmitting}
                    data-testid="button-submit-login"
                  >
                    {isAuthSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogIn className="h-4 w-4" />
                    )}
                    تسجيل الدخول
                  </Button>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="register" className="space-y-4 mt-4">
              <Form {...registerForm}>
                <form onSubmit={registerForm.handleSubmit(handleRegister)} className="space-y-4">
                  <FormField
                    control={registerForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          الاسم الكامل *
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="أدخل اسمك الكامل" 
                            className="text-right"
                            {...field}
                            data-testid="input-register-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          البريد الإلكتروني *
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="email"
                            placeholder="example@domain.com" 
                            className="text-right"
                            dir="ltr"
                            {...field}
                            data-testid="input-register-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2 text-sm">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                          كلمة المرور *
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              type={showPassword ? "text" : "password"}
                              placeholder="أدخل كلمة المرور (6 أحرف على الأقل)"
                              className="text-right pe-10"
                              {...field}
                              data-testid="input-register-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute start-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowPassword(!showPassword)}
                              data-testid="button-toggle-password-register"
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          رقم الجوال (اختياري)
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="05xxxxxxxx" 
                            className="text-right"
                            dir="ltr"
                            {...field}
                            data-testid="input-register-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={registerForm.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2 text-sm">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          اسم الشركة/الجهة (اختياري)
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="اسم الشركة أو المؤسسة" 
                            className="text-right"
                            {...field}
                            data-testid="input-register-company"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full gap-2"
                    disabled={isAuthSubmitting}
                    data-testid="button-submit-register"
                  >
                    {isAuthSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                    إنشاء حساب
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function MediaStore() {
  return (
    <StoreAuthProvider>
      <MediaStoreContent />
    </StoreAuthProvider>
  );
}
