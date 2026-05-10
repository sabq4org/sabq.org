import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Plus, Edit, Trash2, CheckCircle, XCircle, Sparkles, Download, Upload } from "lucide-react";
import type { Theme } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ThemeManager() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [themeToDelete, setThemeToDelete] = useState<Theme | null>(null);
  
  // Import/Export state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");

  const { data: themes, isLoading } = useQuery<Theme[]>({
    queryKey: ["/api/themes"],
  });

  const { data: activeTheme } = useQuery<Theme>({
    queryKey: ["/api/themes/active?scope=site_full"],
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/themes/${id}/publish`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes/active?scope=site_full"] });
      toast({
        title: "تم النشر",
        description: "تم تفعيل السمة بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في نشر السمة",
        variant: "destructive",
      });
    },
  });

  const expireMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/themes/${id}/expire`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes/active?scope=site_full"] });
      toast({
        title: "تم الإنهاء",
        description: "تم إنهاء السمة بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في إنهاء السمة",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/themes/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      toast({
        title: "تم الحذف",
        description: "تم حذف السمة بنجاح. سيعود الموقع للسمة الافتراضية.",
      });
      setDeleteDialogOpen(false);
      setThemeToDelete(null);
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في حذف السمة",
        variant: "destructive",
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/themes/export", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("فشل في تصدير السمات");
      }
      return await response.json();
    },
    onSuccess: (data) => {
      // Create JSON blob and download
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `sabq-themes-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "تم التصدير",
        description: `تم تصدير ${data.themes.length} سمة بنجاح`,
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في تصدير السمات",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (data: { version: string; themes: any[]; mode: string }) => {
      return await apiRequest("/api/themes/import", {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes/active?scope=site_full"] });
      toast({
        title: "تم الاستيراد",
        description: `تم استيراد ${data.imported} سمة بنجاح. تم إنشاء ${data.created} وتحديث ${data.updated}`,
      });
      setIsImportDialogOpen(false);
      setSelectedFile(null);
      setImportMode("merge");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في استيراد السمات",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (theme: Theme) => {
    setThemeToDelete(theme);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (themeToDelete) {
      deleteMutation.mutate(themeToDelete.id);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast({
        title: "خطأ",
        description: "الرجاء اختيار ملف للاستيراد",
        variant: "destructive",
      });
      return;
    }

    try {
      const text = await selectedFile.text();
      const data = JSON.parse(text);

      // Validate JSON structure
      if (!data.version || !data.themes || !Array.isArray(data.themes)) {
        toast({
          title: "خطأ",
          description: "بنية الملف غير صحيحة. يجب أن يحتوي على version و themes",
          variant: "destructive",
        });
        return;
      }

      // Import themes
      importMutation.mutate({
        version: data.version,
        themes: data.themes,
        mode: importMode,
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "الملف المحدد ليس JSON صحيح",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "secondary",
      review: "outline",
      scheduled: "default",
      active: "default",
      expired: "secondary",
      disabled: "destructive",
    };

    const labels: Record<string, string> = {
      draft: "مسودة",
      review: "قيد المراجعة",
      scheduled: "مجدولة",
      active: "نشطة",
      expired: "منتهية",
      disabled: "معطلة",
    };

    return (
      <Badge variant={variants[status] || "default"} data-testid={`badge-status-${status}`}>
        {labels[status] || status}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-theme-manager">إدارة السمات</h1>
            <p className="text-muted-foreground mt-2">
              إدارة السمات والهويات البصرية للمنصة
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              data-testid="button-export-themes"
            >
              <Download className="h-4 w-4 ml-2" />
              {exportMutation.isPending ? "جاري التصدير..." : "تصدير السمات"}
            </Button>
            <Button 
              variant="outline"
              onClick={() => setIsImportDialogOpen(true)}
              data-testid="button-import-themes"
            >
              <Upload className="h-4 w-4 ml-2" />
              استيراد السمات
            </Button>
            <Button 
              onClick={() => setLocation("/dashboard/themes/new")}
              data-testid="button-create-theme"
            >
              <Plus className="h-4 w-4 ml-2" />
              سمة جديدة
            </Button>
          </div>
        </div>

        {/* Active Theme Indicator */}
        {activeTheme && (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                السمة النشطة حالياً
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold" data-testid="text-active-theme-name">
                    {activeTheme.name}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {activeTheme.isDefault ? "السمة الافتراضية للموقع" : "سمة مؤقتة"}
                  </p>
                </div>
                <div className="flex gap-2">
                  {activeTheme.isDefault && (
                    <Badge variant="outline" className="bg-background">افتراضية</Badge>
                  )}
                  {getStatusBadge(activeTheme.status)}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>جميع السمات</CardTitle>
            <CardDescription>
              قائمة بجميع السمات المتاحة في النظام. السمة الافتراضية تظهر دائماً عند عدم وجود سمة نشطة أخرى.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!themes || themes.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4" data-testid="text-no-themes">
                  لا توجد سمات متاحة حالياً
                </p>
                <Button 
                  onClick={() => setLocation("/dashboard/themes/new")}
                  data-testid="button-create-first-theme"
                >
                  إنشاء أول سمة
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الأولوية</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>النطاق</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {themes.map((theme) => {
                    const isCurrentlyActive = activeTheme?.id === theme.id;
                    return (
                      <TableRow 
                        key={theme.id} 
                        data-testid={`row-theme-${theme.id}`}
                        className={isCurrentlyActive ? "bg-primary/5" : ""}
                      >
                        <TableCell className="font-medium" data-testid={`text-theme-name-${theme.id}`}>
                          <div className="flex items-center gap-2">
                            {theme.name}
                            {isCurrentlyActive && (
                              <Sparkles className="h-4 w-4 text-primary" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(theme.status)}</TableCell>
                        <TableCell data-testid={`text-priority-${theme.id}`}>{theme.priority}</TableCell>
                        <TableCell>
                          {theme.isDefault ? (
                            <Badge variant="outline" data-testid={`badge-default-${theme.id}`}>
                              افتراضية
                            </Badge>
                          ) : (
                            <Badge variant="secondary" data-testid={`badge-temporary-${theme.id}`}>
                              مؤقتة
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell data-testid={`text-scope-${theme.id}`}>
                          {theme.applyTo?.join(", ") || "الكل"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setLocation(`/dashboard/themes/${theme.id}`)}
                              data-testid={`button-edit-${theme.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {theme.status === "draft" || theme.status === "review" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => publishMutation.mutate(theme.id)}
                                disabled={publishMutation.isPending}
                                data-testid={`button-publish-${theme.id}`}
                                title="نشر السمة"
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                            ) : null}
                            {theme.status === "active" && !theme.isDefault ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => expireMutation.mutate(theme.id)}
                                disabled={expireMutation.isPending}
                                data-testid={`button-expire-${theme.id}`}
                                title="إنهاء السمة"
                              >
                                <XCircle className="h-4 w-4 text-orange-600" />
                              </Button>
                            ) : null}
                            {!theme.isDefault && (theme.status === "draft" || theme.status === "expired") ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteClick(theme)}
                                disabled={deleteMutation.isPending}
                                data-testid={`button-delete-${theme.id}`}
                                title="حذف السمة"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف السمة "{themeToDelete?.name}"؟
              <br />
              <br />
              <span className="font-semibold text-foreground">
                {activeTheme?.isDefault 
                  ? `سيعود الموقع تلقائياً إلى السمة الافتراضية "${activeTheme.name}".`
                  : "لا يمكن التراجع عن هذا الإجراء."}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>استيراد السمات</DialogTitle>
            <DialogDescription>
              قم برفع ملف JSON يحتوي على السمات المراد استيرادها
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="file-upload">ملف JSON</Label>
              <Input
                id="file-upload"
                type="file"
                accept=".json"
                onChange={handleFileChange}
                data-testid="input-import-file"
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground" data-testid="text-selected-file">
                  الملف المحدد: {selectedFile.name}
                </p>
              )}
            </div>

            {/* Import Mode Selection */}
            <div className="space-y-2">
              <Label htmlFor="import-mode">نمط الاستيراد</Label>
              <Select
                value={importMode}
                onValueChange={(value: "merge" | "replace") => setImportMode(value)}
              >
                <SelectTrigger id="import-mode" data-testid="select-import-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">دمج مع السمات الحالية</SelectItem>
                  <SelectItem value="replace">استبدال جميع السمات</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Warning for Replace Mode */}
            {importMode === "replace" && (
              <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm" data-testid="warning-replace-mode">
                ⚠️ سيتم حذف جميع السمات الحالية!
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsImportDialogOpen(false);
                setSelectedFile(null);
                setImportMode("merge");
              }}
              disabled={importMutation.isPending}
              data-testid="button-cancel-import"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending || !selectedFile}
              data-testid="button-confirm-import"
            >
              {importMutation.isPending ? "جاري الاستيراد..." : "استيراد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
