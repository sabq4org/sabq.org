import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { 
  Megaphone, 
  Plus, 
  Search,
  Eye,
  MousePointer,
  TrendingUp,
  BarChart3,
  Edit2, 
  Pause, 
  Play,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Calendar,
  Upload,
  UserCircle,
  Mail,
  Phone,
  Building2,
  AlertCircle,
  AlertTriangle,
  Wallet,
  Shield,
  FileDown
} from "lucide-react";
// pdfmake is dynamic-imported inside generateAdPDF below (perf audit
// 2026-05-11). Static import was pulling pdfmake/build/vfs_fonts —
// embedded font binaries — into this page's chunk, adding ~2 MB to the
// admin bundle on every page visit. Now downloaded only when the user
// actually clicks "Export PDF".
import type { TDocumentDefinitions, Content, TableCell as PdfTableCell } from "pdfmake/interfaces";

// vfs/font init only runs once across the whole page lifetime.
let pdfMakeInitialized: any = null;
async function getPdfMake(): Promise<any> {
  if (pdfMakeInitialized) return pdfMakeInitialized;
  const [{ default: pdfMake }, pdfFontsModule] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  const pdfFonts: any = pdfFontsModule.default ?? pdfFontsModule;
  pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts.vfs || pdfFonts;
  pdfMake.fonts = {
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
  };
  pdfMakeInitialized = pdfMake;
  return pdfMake;
}
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ImageUploadDialog } from "@/components/ImageUploadDialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertNativeAdSchema, type NativeAd, type Category } from "@shared/schema";
import { z } from "zod";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

type NativeAdStatus = "draft" | "pending_approval" | "pending" | "active" | "paused" | "expired" | "rejected";

const statusColors: Record<NativeAdStatus, string> = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  paused: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  expired: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  pending: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  pending_approval: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  draft: "bg-muted text-muted-foreground border-border",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

const statusLabels: Record<NativeAdStatus, string> = {
  active: "نشط",
  paused: "متوقف مؤقتاً",
  expired: "منتهي",
  pending: "لم يبدأ بعد",
  pending_approval: "قيد المراجعة",
  draft: "مسودة",
  rejected: "مرفوض",
};

const deviceOptions = [
  { value: "all", label: "جميع الأجهزة" },
  { value: "desktop", label: "سطح المكتب" },
  { value: "mobile", label: "الهاتف" },
  { value: "tablet", label: "الجهاز اللوحي" },
];

function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return format(new Date(date), "d MMMM yyyy", { locale: ar });
}

function calculateCTR(impressions: number, clicks: number): string {
  if (impressions === 0) return "0%";
  return ((clicks / impressions) * 100).toFixed(2) + "%";
}

function isBudgetExhaustedToday(exhaustedAt: string | Date | null | undefined): boolean {
  if (!exhaustedAt) return false;
  const exhaustedDate = new Date(exhaustedAt);
  const saudiOffset = 3 * 60 * 60 * 1000;
  const exhaustedSaudiTime = new Date(exhaustedDate.getTime() + saudiOffset);
  const nowSaudiTime = new Date(Date.now() + saudiOffset);
  return exhaustedSaudiTime.toISOString().split('T')[0] === nowSaudiTime.toISOString().split('T')[0];
}

function formatBudgetSAR(halalas: number | null | undefined): string {
  if (!halalas) return "-";
  return (halalas / 100).toFixed(2) + " ر.س";
}

const formSchema = insertNativeAdSchema.refine(
  (data) => {
    if (data.dailyBudget && data.totalBudget) {
      return data.dailyBudget <= data.totalBudget;
    }
    return true;
  },
  {
    message: "الميزانية اليومية لا يمكن أن تتجاوز الميزانية الإجمالية",
    path: ["dailyBudget"],
  }
);

type FormValues = z.infer<typeof formSchema>;

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-16 w-24 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-primary/10 p-6 mb-4">
          <Megaphone className="h-12 w-12 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">لا يوجد محتوى مدفوع</h3>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          ابدأ بإنشاء أول إعلان مدفوع للوصول إلى جمهورك المستهدف
        </p>
        <Button onClick={onCreateClick} data-testid="button-create-first-ad">
          <Plus className="h-4 w-4 ml-2" />
          إنشاء إعلان جديد
        </Button>
      </CardContent>
    </Card>
  );
}

// Professional PDF Export Function for Native Ads (English labels for font compatibility)
const statusLabelsEn: Record<NativeAdStatus, string> = {
  active: "Active",
  paused: "Paused",
  expired: "Expired",
  pending: "Not Started",
  pending_approval: "Pending Approval",
  draft: "Draft",
  rejected: "Rejected",
};

async function generateAdPDF(ad: NativeAd, onSuccess?: () => void, onError?: (error: Error) => void) {
  try {
    const pdfMake = await getPdfMake();
    const currentDate = format(new Date(), "MMMM d, yyyy - HH:mm");
    const totalCost = (ad.clicks * (ad.costPerClick || 100)) / 100;
    const ctr = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : "0.00";
    const totalBudgetSAR = ad.totalBudget ? (ad.totalBudget / 100) : 0;
    const dailyBudgetSAR = (ad as any).dailyBudget ? ((ad as any).dailyBudget / 100) : 0;
    const todaySpendSAR = (ad as any).todaySpendHalalas ? ((ad as any).todaySpendHalalas / 100) : 0;
    const remainingBudget = totalBudgetSAR - totalCost;
    const budgetUsagePercent = totalBudgetSAR > 0 ? ((totalCost / totalBudgetSAR) * 100).toFixed(1) : "0";

    const docDefinition: TDocumentDefinitions = {
      pageSize: "A4",
      pageOrientation: "portrait",
      pageMargins: [40, 60, 40, 60],
      
      content: [
        // Header
        {
          columns: [
            {
              text: "Native Ad Performance Report",
              style: "header",
              alignment: "left" as const,
            },
            {
              text: `Report Date: ${currentDate}`,
              style: "dateText",
              alignment: "right" as const,
            },
          ],
        },
        { text: "", margin: [0, 10, 0, 10] as [number, number, number, number] },
        
        // Ad Title Section
        {
          table: {
            widths: ["*"],
            body: [
              [{ 
                text: `Ad: ${ad.title}`, 
                style: "adTitle",
                fillColor: "#f8f9fa",
                margin: [15, 12, 15, 12] as [number, number, number, number],
              }],
            ],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => "#e9ecef",
            vLineColor: () => "#e9ecef",
          },
        },
        { text: "", margin: [0, 15, 0, 15] as [number, number, number, number] },

        // Advertiser Info
        {
          text: "Advertiser Information",
          style: "sectionTitle",
          alignment: "left" as const,
        },
        {
          table: {
            widths: ["30%", "70%"],
            body: [
              [
                { text: "Advertiser Name", style: "tableLabel", alignment: "left" as const },
                { text: ad.advertiserName || "-", style: "tableValue", alignment: "left" as const },
              ],
              [
                { text: "Status", style: "tableLabel", alignment: "left" as const },
                { text: statusLabelsEn[ad.status as NativeAdStatus] || ad.status, style: "tableValue", alignment: "left" as const },
              ],
              [
                { text: "Start Date", style: "tableLabel", alignment: "left" as const },
                { text: ad.startDate ? format(new Date(ad.startDate), "MMMM d, yyyy") : "-", style: "tableValue", alignment: "left" as const },
              ],
              [
                { text: "End Date", style: "tableLabel", alignment: "left" as const },
                { text: ad.endDate ? format(new Date(ad.endDate), "MMMM d, yyyy") : "Not Set", style: "tableValue", alignment: "left" as const },
              ],
            ],
          },
          layout: "lightHorizontalLines",
        },
        { text: "", margin: [0, 20, 0, 20] as [number, number, number, number] },

        // Budget Section
        {
          text: "Budget & Costs",
          style: "sectionTitle",
          alignment: "left" as const,
        },
        {
          table: {
            widths: ["25%", "25%", "25%", "25%"],
            body: [
              [
                { text: "Total Budget", style: "statLabel", alignment: "center" as const, fillColor: "#e3f2fd" },
                { text: "Amount Spent", style: "statLabel", alignment: "center" as const, fillColor: "#fff3e0" },
                { text: "Remaining", style: "statLabel", alignment: "center" as const, fillColor: "#e8f5e9" },
                { text: "Usage %", style: "statLabel", alignment: "center" as const, fillColor: "#fce4ec" },
              ],
              [
                { text: `${totalBudgetSAR.toFixed(2)} SAR`, style: "statValue", alignment: "center" as const },
                { text: `${totalCost.toFixed(2)} SAR`, style: "statValue", alignment: "center" as const },
                { text: `${remainingBudget.toFixed(2)} SAR`, style: "statValue", alignment: "center" as const },
                { text: `${budgetUsagePercent}%`, style: "statValue", alignment: "center" as const },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => "#dee2e6",
            vLineColor: () => "#dee2e6",
          },
        },
        { text: "", margin: [0, 10, 0, 10] as [number, number, number, number] },
        
        // Daily Budget Info
        dailyBudgetSAR > 0 ? {
          table: {
            widths: ["33%", "33%", "34%"],
            body: [
              [
                { text: "Daily Budget", style: "statLabel", alignment: "center" as const, fillColor: "#f3e5f5" },
                { text: "Today's Spend", style: "statLabel", alignment: "center" as const, fillColor: "#e1f5fe" },
                { text: "Cost Per Click", style: "statLabel", alignment: "center" as const, fillColor: "#fff8e1" },
              ],
              [
                { text: `${dailyBudgetSAR.toFixed(2)} SAR`, style: "statValue", alignment: "center" as const },
                { text: `${todaySpendSAR.toFixed(2)} SAR`, style: "statValue", alignment: "center" as const },
                { text: `${((ad.costPerClick || 100) / 100).toFixed(2)} SAR`, style: "statValue", alignment: "center" as const },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => "#dee2e6",
            vLineColor: () => "#dee2e6",
          },
        } : { text: "" },
        { text: "", margin: [0, 20, 0, 20] as [number, number, number, number] },

        // Performance Stats
        {
          text: "Performance Statistics",
          style: "sectionTitle",
          alignment: "left" as const,
        },
        {
          table: {
            widths: ["33%", "34%", "33%"],
            body: [
              [
                { text: "Impressions", style: "statLabel", alignment: "center" as const, fillColor: "#e8eaf6" },
                { text: "Clicks", style: "statLabel", alignment: "center" as const, fillColor: "#fce4ec" },
                { text: "CTR (Click-Through Rate)", style: "statLabel", alignment: "center" as const, fillColor: "#e0f7fa" },
              ],
              [
                { text: formatNumber(ad.impressions), style: "bigStatValue", alignment: "center" as const },
                { text: formatNumber(ad.clicks), style: "bigStatValue", alignment: "center" as const },
                { text: `${ctr}%`, style: "bigStatValue", alignment: "center" as const },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => "#dee2e6",
            vLineColor: () => "#dee2e6",
          },
        },
        { text: "", margin: [0, 20, 0, 20] as [number, number, number, number] },

        // Performance Analysis
        {
          text: "Performance Analysis",
          style: "sectionTitle",
          alignment: "left" as const,
        },
        {
          ul: [
            ad.impressions > 0 
              ? `The ad achieved ${formatNumber(ad.impressions)} impressions since campaign start`
              : "The ad has not received any impressions yet",
            ad.clicks > 0 
              ? `The ad received ${formatNumber(ad.clicks)} clicks`
              : "The ad has not received any clicks yet",
            parseFloat(ctr) >= 1 
              ? `CTR of ${ctr}% is considered good performance`
              : parseFloat(ctr) >= 0.5 
                ? `CTR of ${ctr}% is considered average performance`
                : `CTR of ${ctr}% needs improvement`,
            remainingBudget > 0 
              ? `Remaining budget: ${remainingBudget.toFixed(2)} SAR`
              : "Budget has been fully consumed",
          ],
          style: "analysisList",
        },
        { text: "", margin: [0, 30, 0, 30] as [number, number, number, number] },

        // Footer
        {
          columns: [
            {
              text: "Sabq - Smart News Platform",
              style: "footerText",
              alignment: "left" as const,
            },
            {
              text: "sabq.org",
              style: "footerLink",
              alignment: "right" as const,
            },
          ],
        },
      ],
      
      styles: {
        header: {
          fontSize: 22,
          bold: true,
          color: "#1a1a2e",
        },
        dateText: {
          fontSize: 10,
          color: "#6c757d",
        },
        adTitle: {
          fontSize: 16,
          bold: true,
          color: "#2d3748",
        },
        sectionTitle: {
          fontSize: 14,
          bold: true,
          color: "#1a1a2e",
          margin: [0, 0, 0, 10] as [number, number, number, number],
        },
        tableLabel: {
          fontSize: 11,
          color: "#495057",
          margin: [5, 8, 5, 8] as [number, number, number, number],
        },
        tableValue: {
          fontSize: 11,
          bold: true,
          color: "#212529",
          margin: [5, 8, 5, 8] as [number, number, number, number],
        },
        statLabel: {
          fontSize: 10,
          color: "#495057",
          margin: [5, 8, 5, 8] as [number, number, number, number],
        },
        statValue: {
          fontSize: 12,
          bold: true,
          color: "#212529",
          margin: [5, 10, 5, 10] as [number, number, number, number],
        },
        bigStatValue: {
          fontSize: 18,
          bold: true,
          color: "#1a1a2e",
          margin: [5, 12, 5, 12] as [number, number, number, number],
        },
        analysisList: {
          fontSize: 11,
          color: "#495057",
          alignment: "left" as const,
          margin: [0, 5, 20, 5] as [number, number, number, number],
        },
        footerText: {
          fontSize: 10,
          color: "#6c757d",
        },
        footerLink: {
          fontSize: 10,
          color: "#007bff",
        },
      },
      
      defaultStyle: {
        font: "Roboto",
      },
    };

    const fileName = `Ad_Report_${ad.id}_${format(new Date(), "yyyyMMdd_HHmmss")}.pdf`;
    pdfMake.createPdf(docDefinition).download(fileName);
    onSuccess?.();
  } catch (error) {
    console.error("PDF generation error:", error);
    onError?.(error instanceof Error ? error : new Error("Failed to generate PDF"));
  }
}

export default function NativeAdsManagement() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [adToDelete, setAdToDelete] = useState<NativeAd | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<NativeAd | null>(null);
  const [uploadTarget, setUploadTarget] = useState<"imageUrl" | "advertiserLogo" | null>(null);

  useEffect(() => {
    document.title = "إدارة المحتوى المدفوع - لوحة التحكم";
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      imageUrl: "",
      destinationUrl: "",
      callToAction: "اقرأ المزيد",
      advertiserName: "",
      advertiserLogo: "",
      targetCategories: [],
      targetKeywords: [],
      targetDevices: "all",
      startDate: new Date(),
      endDate: null,
      dailyBudget: undefined,
      totalBudget: undefined,
      costPerClick: 100,
      priority: 5,
      status: "draft",
    },
  });

  const { data: adsRaw, isLoading } = useQuery<NativeAd[]>({
    queryKey: ["/api/native-ads", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      const url = `/api/native-ads${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error("فشل في جلب الإعلانات");
      }
      const data = await response.json();
      return data.ads || [];
    },
  });
  const ads = Array.isArray(adsRaw) ? adsRaw : [];

  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      return await apiRequest("/api/native-ads", {
        method: "POST",
        body: JSON.stringify(values),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/native-ads"] });
      toast({
        title: "تم إنشاء الإعلان",
        description: "تم إنشاء الإعلان بنجاح",
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء الإعلان",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<FormValues> }) => {
      return await apiRequest(`/api/native-ads/${id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: async () => {
      // Force immediate refetch to update all metrics (CTR, budget usage, etc.)
      await queryClient.refetchQueries({ queryKey: ["/api/native-ads"], exact: false });
      toast({
        title: "تم تحديث الإعلان",
        description: "تم تحديث الإعلان بنجاح",
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الإعلان",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/native-ads/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/native-ads"] });
      toast({
        title: "تم حذف الإعلان",
        description: "تم حذف الإعلان بنجاح",
      });
      setAdToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الإعلان",
        variant: "destructive",
      });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: NativeAdStatus }) => {
      await apiRequest(`/api/native-ads/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: async (_, variables) => {
      // Force immediate refetch to update all metrics
      await queryClient.refetchQueries({ queryKey: ["/api/native-ads"], exact: false });
      const action = variables.newStatus === "paused" ? "إيقاف" : "تفعيل";
      toast({
        title: `تم ${action} الإعلان`,
        description: `تم ${action} الإعلان بنجاح`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث حالة الإعلان",
        variant: "destructive",
      });
    },
  });

  const handleOpenDialog = (ad?: NativeAd) => {
    if (ad) {
      setEditingAd(ad);
      form.reset({
        title: ad.title,
        description: ad.description || "",
        imageUrl: ad.imageUrl,
        destinationUrl: ad.destinationUrl,
        callToAction: ad.callToAction || "اقرأ المزيد",
        advertiserName: ad.advertiserName,
        advertiserLogo: ad.advertiserLogo || "",
        targetCategories: ad.targetCategories || [],
        targetKeywords: ad.targetKeywords || [],
        targetDevices: ad.targetDevices as "all" | "desktop" | "mobile" | "tablet",
        startDate: new Date(ad.startDate),
        endDate: ad.endDate ? new Date(ad.endDate) : null,
        dailyBudget: ad.dailyBudget || undefined,
        totalBudget: ad.totalBudget || undefined,
        costPerClick: ad.costPerClick || 100,
        priority: ad.priority,
        status: (ad.status === "pending" ? "pending_approval" : ad.status) as FormValues["status"],
      });
    } else {
      setEditingAd(null);
      form.reset({
        title: "",
        description: "",
        imageUrl: "",
        destinationUrl: "",
        callToAction: "اقرأ المزيد",
        advertiserName: "",
        advertiserLogo: "",
        targetCategories: [],
        targetKeywords: [],
        targetDevices: "all",
        startDate: new Date(),
        endDate: null,
        dailyBudget: undefined,
        totalBudget: undefined,
        costPerClick: 100,
        priority: 5,
        status: "draft",
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingAd(null);
    form.reset();
  };

  const onSubmit = (values: FormValues) => {
    if (editingAd) {
      updateMutation.mutate({ id: editingAd.id, values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleToggleStatus = (ad: NativeAd) => {
    const newStatus = ad.status === "active" ? "paused" : "active";
    toggleStatusMutation.mutate({ id: ad.id, newStatus });
  };

  const filteredAds = ads.filter((ad) =>
    ad.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ad.advertiserName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalAds = ads.length;
  // Use derivedStatus for accurate count (considers expired/pending based on dates)
  const activeAds = ads.filter((a) => ((a as any).derivedStatus || a.status) === "active").length;
  const totalImpressions = ads.reduce((sum, a) => sum + a.impressions, 0);
  const totalClicks = ads.reduce((sum, a) => sum + a.clicks, 0);
  const overallCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0";

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6" dir="rtl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-600">
              <Megaphone className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">إدارة المحتوى المدفوع</h1>
              <p className="text-sm text-muted-foreground">
                إدارة الإعلانات المدفوعة والمحتوى الراعي
              </p>
            </div>
          </div>
          <Button onClick={() => handleOpenDialog()} data-testid="button-create-ad">
            <Plus className="h-4 w-4 ml-2" />
            إنشاء إعلان جديد
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-5 mb-6">
          <Card className="hover-elevate active-elevate-2 transition-all bg-purple-50 dark:bg-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الإعلانات</CardTitle>
              <div className="p-2 rounded-md bg-purple-500/20">
                <BarChart3 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-ads">
                {formatNumber(totalAds)}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-green-50 dark:bg-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الإعلانات النشطة</CardTitle>
              <div className="p-2 rounded-md bg-green-500/20">
                <Play className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-active-ads">
                {formatNumber(activeAds)}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-blue-50 dark:bg-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي المشاهدات</CardTitle>
              <div className="p-2 rounded-md bg-blue-500/20">
                <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-impressions">
                {formatNumber(totalImpressions)}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-amber-50 dark:bg-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي النقرات</CardTitle>
              <div className="p-2 rounded-md bg-amber-500/20">
                <MousePointer className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-clicks">
                {formatNumber(totalClicks)}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-pink-50 dark:bg-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">معدل النقر (CTR)</CardTitle>
              <div className="p-2 rounded-md bg-pink-500/20">
                <TrendingUp className="h-4 w-4 text-pink-600 dark:text-pink-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-overall-ctr">
                {overallCTR}%
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>الفلاتر</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالعنوان أو اسم المعلن..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10"
                    data-testid="input-search"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[200px]" data-testid="select-status-filter">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="pending_approval">قيد المراجعة</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="paused">متوقف مؤقتاً</SelectItem>
                  <SelectItem value="expired">منتهي</SelectItem>
                  <SelectItem value="rejected">مرفوض</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <TableSkeleton />
        ) : filteredAds.length === 0 ? (
          <EmptyState onCreateClick={() => handleOpenDialog()} />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">الصورة</TableHead>
                    <TableHead>العنوان</TableHead>
                    <TableHead>المعلن</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="text-center">المشاهدات</TableHead>
                    <TableHead className="text-center">النقرات</TableHead>
                    <TableHead className="text-center">CTR</TableHead>
                    <TableHead className="text-center">التكلفة الإجمالية</TableHead>
                    <TableHead className="text-center">الأولوية</TableHead>
                    <TableHead>التواريخ</TableHead>
                    <TableHead className="text-left">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAds.map((ad) => (
                    <TableRow key={ad.id} data-testid={`row-ad-${ad.id}`}>
                      <TableCell>
                        <div className="w-20 h-14 rounded overflow-hidden bg-muted">
                          {ad.imageUrl ? (
                            <img
                              src={ad.imageUrl}
                              alt={ad.title}
                              className="w-full h-full object-cover"
                              data-testid={`img-ad-${ad.id}`}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium" data-testid={`text-title-${ad.id}`}>
                          {ad.title}
                        </div>
                        {ad.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {ad.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-advertiser-${ad.id}`}>
                        <div className="flex flex-col gap-1">
                          <span>{ad.advertiserName}</span>
                          {(ad as any).isSelfServe ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary" className="text-xs w-fit cursor-help bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                                  <UserCircle className="h-3 w-3 ml-1" />
                                  خدمة ذاتية
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-right" dir="rtl">
                                <div className="space-y-1 text-sm">
                                  {(ad as any).advertiserEmail && (
                                    <div className="flex items-center gap-2">
                                      <Mail className="h-3 w-3" />
                                      <span>{(ad as any).advertiserEmail}</span>
                                    </div>
                                  )}
                                  {(ad as any).advertiserPhone && (
                                    <div className="flex items-center gap-2">
                                      <Phone className="h-3 w-3" />
                                      <span dir="ltr">{(ad as any).advertiserPhone}</span>
                                    </div>
                                  )}
                                  {(ad as any).advertiserCompany && (
                                    <div className="flex items-center gap-2">
                                      <Building2 className="h-3 w-3" />
                                      <span>{(ad as any).advertiserCompany}</span>
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Badge variant="outline" className="text-xs w-fit bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                              <Shield className="h-3 w-3 ml-1" />
                              إدارة سبق
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant="outline"
                            className={statusColors[((ad as any).derivedStatus || ad.status) as NativeAdStatus]}
                            data-testid={`badge-status-${ad.id}`}
                          >
                            {statusLabels[((ad as any).derivedStatus || ad.status) as NativeAdStatus]}
                          </Badge>
                          {((ad as any).dailyBudgetEnabled || (ad as any).dailyBudget > 0) && (ad as any).dailyBudget > 0 && (() => {
                            const usagePercent = (ad as any).dailyBudgetUsagePercent || 0;
                            const todaySpend = (ad as any).todaySpendHalalas || 0;
                            const dailyBudget = (ad as any).dailyBudget || 0;
                            const remainingToday = Math.max(0, dailyBudget - todaySpend);
                            const isExhausted = isBudgetExhaustedToday((ad as any).dailyBudgetExhaustedAt) || usagePercent >= 100;
                            const isWarning = usagePercent >= 80 && usagePercent < 100;
                            
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge 
                                    variant={isExhausted ? "destructive" : "secondary"}
                                    className={`text-xs gap-1 cursor-help ${isWarning ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}`}
                                    data-testid={`badge-daily-budget-${ad.id}`}
                                  >
                                    {isExhausted ? (
                                      <>
                                        <AlertCircle className="h-3 w-3" />
                                        انتهى الحد اليومي
                                      </>
                                    ) : isWarning ? (
                                      <>
                                        <AlertTriangle className="h-3 w-3" />
                                        متبقي: {formatBudgetSAR(remainingToday)}
                                      </>
                                    ) : (
                                      <>
                                        <Wallet className="h-3 w-3" />
                                        {formatBudgetSAR(dailyBudget)}/يوم ({100 - usagePercent}% متبقي)
                                      </>
                                    )}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" dir="rtl">
                                  <div className="text-sm space-y-1">
                                    <p className="font-semibold border-b pb-1 mb-1">الميزانية اليومية</p>
                                    <p>الحد اليومي: {formatBudgetSAR(dailyBudget)}</p>
                                    <p>الإنفاق اليوم: {formatBudgetSAR(todaySpend)}</p>
                                    <p className={isExhausted ? "text-destructive font-semibold" : isWarning ? "text-orange-500 font-semibold" : "text-green-600 dark:text-green-400"}>
                                      المتبقي اليوم: {formatBudgetSAR(remainingToday)}
                                    </p>
                                    <p className="text-muted-foreground text-xs">نسبة الاستخدام: {usagePercent}%</p>
                                    {isExhausted && (
                                      <p className="text-muted-foreground text-xs mt-2 border-t pt-1">سيتم إعادة التفعيل عند منتصف الليل</p>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-impressions-${ad.id}`}>
                        {formatNumber(ad.impressions)}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-clicks-${ad.id}`}>
                        {formatNumber(ad.clicks)}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-ctr-${ad.id}`}>
                        {calculateCTR(ad.impressions, ad.clicks)}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-cost-${ad.id}`}>
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-medium">
                            {((ad.clicks * (ad.costPerClick || 100)) / 100).toFixed(2)} ر.س
                          </span>
                          {((ad as any).dailyBudgetEnabled || (ad as any).dailyBudget > 0) && (ad as any).dailyBudget > 0 && (
                            <span className="text-xs text-muted-foreground" data-testid={`text-today-spend-${ad.id}`}>
                              اليوم: {formatBudgetSAR((ad as any).todaySpendHalalas || 0)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-priority-${ad.id}`}>
                        <Badge variant="secondary">{ad.priority}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(ad.startDate)}</span>
                          </div>
                          {ad.endDate && (
                            <div className="text-xs text-muted-foreground mt-1">
                              إلى: {formatDate(ad.endDate)}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => generateAdPDF(
                                  ad,
                                  () => toast({
                                    title: "تم تصدير التقرير",
                                    description: "تم تحميل تقرير PDF بنجاح",
                                  }),
                                  (error) => toast({
                                    title: "فشل التصدير",
                                    description: "حدث خطأ أثناء إنشاء التقرير",
                                    variant: "destructive",
                                  })
                                )}
                                data-testid={`button-export-pdf-${ad.id}`}
                              >
                                <FileDown className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              <p>تصدير تقرير PDF</p>
                            </TooltipContent>
                          </Tooltip>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleOpenDialog(ad)}
                            data-testid={`button-edit-${ad.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {(ad.status === "active" || ad.status === "paused") && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleToggleStatus(ad)}
                              disabled={toggleStatusMutation.isPending}
                              data-testid={`button-toggle-${ad.id}`}
                            >
                              {ad.status === "active" ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setAdToDelete(ad)}
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-delete-${ad.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>
                {editingAd ? "تعديل الإعلان" : "إنشاء إعلان جديد"}
              </DialogTitle>
              <DialogDescription>
                {editingAd
                  ? "قم بتعديل تفاصيل الإعلان أدناه"
                  : "أدخل تفاصيل الإعلان الجديد"}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>عنوان الإعلان *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="عنوان الإعلان"
                            {...field}
                            data-testid="input-title"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="advertiserName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>اسم المعلن *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="اسم المعلن"
                            {...field}
                            data-testid="input-advertiser-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>المحتوى</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="المحتوى الذي سيظهر للقراء"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="imageUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>رابط الصورة *</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              placeholder="https://example.com/image.jpg"
                              {...field}
                              data-testid="input-image-url"
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setUploadTarget("imageUrl")}
                            title="رفع صورة"
                            data-testid="button-upload-image"
                          >
                            <Upload className="h-4 w-4" />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="destinationUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>رابط الوجهة *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://example.com/landing-page"
                            {...field}
                            data-testid="input-destination-url"
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
                    name="callToAction"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>زر الإجراء (CTA)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="اقرأ المزيد"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-cta"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="advertiserLogo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>شعار المعلن</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              placeholder="https://example.com/logo.png"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-advertiser-logo"
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setUploadTarget("advertiserLogo")}
                            title="رفع شعار"
                            data-testid="button-upload-logo"
                          >
                            <Upload className="h-4 w-4" />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="targetCategories"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>التصنيفات المستهدفة</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const current = field.value || [];
                          if (!current.includes(value)) {
                            field.onChange([...current, value]);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-target-categories">
                            <SelectValue placeholder="اختر التصنيفات المستهدفة" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.nameAr}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {field.value && field.value.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {field.value.map((catId) => {
                            const cat = categories.find((c) => c.id === catId);
                            return (
                              <Badge
                                key={catId}
                                variant="secondary"
                                className="cursor-pointer"
                                onClick={() =>
                                  field.onChange(field.value?.filter((id) => id !== catId))
                                }
                              >
                                {cat?.nameAr || catId} ×
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                      <FormDescription>
                        اختر التصنيفات التي سيظهر فيها الإعلان
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="targetDevices"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الأجهزة المستهدفة</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-target-devices">
                              <SelectValue placeholder="اختر الأجهزة" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {deviceOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الحالة</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-status">
                              <SelectValue placeholder="اختر الحالة" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft">مسودة</SelectItem>
                            <SelectItem value="pending_approval">قيد المراجعة</SelectItem>
                            <SelectItem value="active">نشط</SelectItem>
                            <SelectItem value="paused">متوقف مؤقتاً</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>تاريخ البداية *</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            value={field.value ? format(field.value, "yyyy-MM-dd") : ""}
                            onChange={(e) => field.onChange(new Date(e.target.value))}
                            data-testid="input-start-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>تاريخ الانتهاء</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            value={field.value ? format(field.value, "yyyy-MM-dd") : ""}
                            onChange={(e) =>
                              field.onChange(e.target.value ? new Date(e.target.value) : null)
                            }
                            data-testid="input-end-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الأولوية: {field.value}</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          onValueChange={(v) => field.onChange(v[0])}
                          min={1}
                          max={10}
                          step={1}
                          className="w-full"
                          data-testid="slider-priority"
                        />
                      </FormControl>
                      <FormDescription>
                        أولوية أعلى = ظهور أكثر (1-10)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="dailyBudget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الميزانية اليومية (ر.س)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="500"
                            {...field}
                            value={field.value ? field.value / 100 : ""}
                            onChange={(e) =>
                              field.onChange(e.target.value ? Number(e.target.value) * 100 : undefined)
                            }
                            data-testid="input-daily-budget"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="totalBudget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الميزانية الإجمالية (ر.س)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="5000"
                            {...field}
                            value={field.value ? field.value / 100 : ""}
                            onChange={(e) =>
                              field.onChange(e.target.value ? Number(e.target.value) * 100 : undefined)
                            }
                            data-testid="input-total-budget"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="costPerClick"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>تكلفة النقرة (هللة)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="100"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) =>
                              field.onChange(e.target.value ? Number(e.target.value) : 100)
                            }
                            data-testid="input-cost-per-click"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter className="gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseDialog}
                    data-testid="button-cancel"
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    )}
                    {editingAd ? "حفظ التعديلات" : "إنشاء الإعلان"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!adToDelete} onOpenChange={() => setAdToDelete(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>حذف الإعلان</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف الإعلان "{adToDelete?.title}"؟ لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => adToDelete && deleteMutation.mutate(adToDelete.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending && (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                )}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Image Upload Dialog */}
        <ImageUploadDialog
          open={uploadTarget !== null}
          onOpenChange={(open) => {
            if (!open) setUploadTarget(null);
          }}
          onImageUploaded={(url) => {
            if (uploadTarget) {
              form.setValue(uploadTarget, url);
            }
            setUploadTarget(null);
          }}
        />
      </div>
    </DashboardLayout>
  );
}
