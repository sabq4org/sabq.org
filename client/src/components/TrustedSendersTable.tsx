import { useState } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { MoreVertical, Eye, EyeOff, Copy, Edit, Trash2, Ban, CheckCircle } from "lucide-react";
import { Skeleton } from "./ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { TrustedEmailSender } from "@shared/schema";

interface TrustedSendersTableProps {
  senders?: TrustedEmailSender[];
  isLoading?: boolean;
  onEdit: (sender: TrustedEmailSender) => void;
  onDelete: (senderId: string) => void;
  onToggleStatus: (senderId: string, newStatus: "active" | "suspended") => void;
}

export function TrustedSendersTable({
  senders,
  isLoading,
  onEdit,
  onDelete,
  onToggleStatus,
}: TrustedSendersTableProps) {
  const { toast } = useToast();
  const [visibleTokens, setVisibleTokens] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [senderToDelete, setSenderToDelete] = useState<string | null>(null);

  const toggleTokenVisibility = (senderId: string) => {
    setVisibleTokens((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(senderId)) {
        newSet.delete(senderId);
      } else {
        newSet.add(senderId);
      }
      return newSet;
    });
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast({
      title: "تم النسخ",
      description: "تم نسخ الرمز السري إلى الحافظة",
    });
  };

  const handleDeleteClick = (senderId: string) => {
    setSenderToDelete(senderId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (senderToDelete) {
      onDelete(senderToDelete);
      setSenderToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            نشط
          </Badge>
        );
      case "suspended":
        return (
          <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
            معلق
          </Badge>
        );
      case "revoked":
        return (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
            ملغي
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getLanguageName = (lang: string) => {
    switch (lang) {
      case "ar":
        return "عربية";
      case "en":
        return "إنجليزية";
      case "ur":
        return "أردية";
      default:
        return lang;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!senders || senders.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-muted-foreground">لا يوجد مرسلين موثوقين حالياً</p>
        <p className="text-sm text-muted-foreground mt-2">
          قم بإضافة مرسل موثوق للبدء في استقبال الرسائل
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop view - Table */}
      <div className="hidden lg:block rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">البريد الإلكتروني</TableHead>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">اللغة</TableHead>
                <TableHead className="text-right">نشر تلقائي</TableHead>
                <TableHead className="text-right">الرمز السري</TableHead>
                <TableHead className="text-right">تاريخ الإنشاء</TableHead>
                <TableHead className="text-right w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {senders.map((sender) => (
                <TableRow key={sender.id} data-testid={`row-sender-${sender.id}`}>
                  <TableCell className="font-medium">
                    {sender.email}
                  </TableCell>
                  <TableCell>{sender.name}</TableCell>
                  <TableCell>{getStatusBadge(sender.status)}</TableCell>
                  <TableCell>{getLanguageName(sender.language)}</TableCell>
                  <TableCell>
                    {sender.autoPublish ? (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                        نعم
                      </Badge>
                    ) : (
                      <Badge variant="outline">لا</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {sender.token ? (
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono px-2 py-1 bg-muted rounded max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">
                          {visibleTokens.has(sender.id)
                            ? sender.token
                            : "•".repeat(Math.min(sender.token.length, 32))}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => toggleTokenVisibility(sender.id)}
                          data-testid={`button-toggle-token-${sender.id}`}
                        >
                          {visibleTokens.has(sender.id) ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => copyToken(sender.token)}
                          data-testid={`button-copy-token-${sender.id}`}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {format(new Date(sender.createdAt), "dd MMM yyyy", {
                      locale: ar,
                    })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`button-actions-${sender.id}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => onEdit(sender)}
                          data-testid={`action-edit-${sender.id}`}
                        >
                          <Edit className="h-4 w-4 ml-2" />
                          تعديل
                        </DropdownMenuItem>
                        
                        {sender.status === "active" ? (
                          <DropdownMenuItem
                            onClick={() => onToggleStatus(sender.id, "suspended")}
                            data-testid={`action-suspend-${sender.id}`}
                          >
                            <Ban className="h-4 w-4 ml-2" />
                            تعليق
                          </DropdownMenuItem>
                        ) : sender.status === "suspended" ? (
                          <DropdownMenuItem
                            onClick={() => onToggleStatus(sender.id, "active")}
                            data-testid={`action-activate-${sender.id}`}
                          >
                            <CheckCircle className="h-4 w-4 ml-2" />
                            تنشيط
                          </DropdownMenuItem>
                        ) : null}
                        
                        <DropdownMenuSeparator />
                        
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(sender.id)}
                          className="text-destructive focus:text-destructive"
                          data-testid={`action-delete-${sender.id}`}
                        >
                          <Trash2 className="h-4 w-4 ml-2" />
                          حذف
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile view - Cards */}
      <div className="lg:hidden space-y-4">
        {senders.map((sender) => (
          <div
            key={sender.id}
            className="rounded-lg border p-4 space-y-3"
            data-testid={`card-sender-${sender.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <h3 className="font-semibold text-base mb-1">{sender.name}</h3>
                <p className="text-sm text-muted-foreground mb-2">{sender.email}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(sender.status)}
                  {sender.autoPublish ? (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                      نشر تلقائي
                    </Badge>
                  ) : null}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    data-testid={`button-actions-${sender.id}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => onEdit(sender)}
                    data-testid={`action-edit-${sender.id}`}
                  >
                    <Edit className="h-4 w-4 ml-2" />
                    تعديل
                  </DropdownMenuItem>
                  
                  {sender.status === "active" ? (
                    <DropdownMenuItem
                      onClick={() => onToggleStatus(sender.id, "suspended")}
                      data-testid={`action-suspend-${sender.id}`}
                    >
                      <Ban className="h-4 w-4 ml-2" />
                      تعليق
                    </DropdownMenuItem>
                  ) : sender.status === "suspended" ? (
                    <DropdownMenuItem
                      onClick={() => onToggleStatus(sender.id, "active")}
                      data-testid={`action-activate-${sender.id}`}
                    >
                      <CheckCircle className="h-4 w-4 ml-2" />
                      تنشيط
                    </DropdownMenuItem>
                  ) : null}
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem
                    onClick={() => handleDeleteClick(sender.id)}
                    className="text-destructive focus:text-destructive"
                    data-testid={`action-delete-${sender.id}`}
                  >
                    <Trash2 className="h-4 w-4 ml-2" />
                    حذف
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">اللغة:</span>
                <span>{getLanguageName(sender.language)}</span>
              </div>

              {sender.token && (
                <div className="space-y-1">
                  <span className="text-muted-foreground">الرمز السري:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs font-mono px-2 py-1 bg-muted rounded flex-1 overflow-hidden text-ellipsis">
                      {visibleTokens.has(sender.id)
                        ? sender.token
                        : "•".repeat(Math.min(sender.token.length, 32))}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleTokenVisibility(sender.id)}
                      data-testid={`button-toggle-token-${sender.id}`}
                    >
                      {visibleTokens.has(sender.id) ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyToken(sender.token)}
                      data-testid={`button-copy-token-${sender.id}`}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">تاريخ الإنشاء:</span>
                <span className="text-xs">
                  {format(new Date(sender.createdAt), "dd MMM yyyy", {
                    locale: ar,
                  })}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              لا يمكن التراجع عن هذا الإجراء. سيتم حذف المرسل الموثوق نهائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-confirm"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
