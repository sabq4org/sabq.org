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
import { Checkbox } from "./ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { ChevronLeft, ChevronRight, Trash2, Paperclip } from "lucide-react";
import { Skeleton } from "./ui/skeleton";
import type { EmailWebhookLog } from "@shared/schema";

interface WebhookLogsTableProps {
  logs?: EmailWebhookLog[];
  isLoading?: boolean;
  totalCount?: number;
  currentPage?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onStatusFilter?: (status: string) => void;
  onRowClick?: (log: EmailWebhookLog) => void;
  onDelete?: (id: string) => void;
  onBulkDelete?: (ids: string[]) => void;
}

export function WebhookLogsTable({
  logs,
  isLoading,
  totalCount = 0,
  currentPage = 1,
  pageSize = 50,
  onPageChange,
  onStatusFilter,
  onRowClick,
  onDelete,
  onBulkDelete,
}: WebhookLogsTableProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleStatusChange = (value: string) => {
    setSelectedStatus(value);
    onStatusFilter?.(value);
    setSelectedIds([]); // Clear selection when filter changes
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && logs) {
      setSelectedIds(logs.map((log) => log.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectLog = (logId: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, logId]);
    } else {
      setSelectedIds((prev) => prev.filter((id) => id !== logId));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length > 0 && onBulkDelete) {
      onBulkDelete(selectedIds);
      setSelectedIds([]);
    }
  };

  const handleDelete = (e: React.MouseEvent, logId: string) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(logId);
      setSelectedIds((prev) => prev.filter((id) => id !== logId));
    }
  };

  const isAllSelected = logs && logs.length > 0 && selectedIds.length === logs.length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            منشور
          </Badge>
        );
      case "drafted":
        return (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
            مسودة
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
            مرفوض
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
            فشل
          </Badge>
        );
      case "processing":
        return (
          <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
            جاري المعالجة
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getLanguageName = (lang?: string) => {
    if (!lang) return "-";
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

  const totalPages = Math.ceil(totalCount / pageSize);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <label className="text-sm font-medium whitespace-nowrap">الحالة:</label>
          <Select value={selectedStatus} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="published">منشور</SelectItem>
              <SelectItem value="drafted">مسودة</SelectItem>
              <SelectItem value="rejected">مرفوض</SelectItem>
              <SelectItem value="failed">فشل</SelectItem>
              <SelectItem value="processing">جاري المعالجة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {onBulkDelete && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={selectedIds.length === 0}
            data-testid="button-delete-selected"
            className="w-full sm:w-auto"
          >
            <Trash2 className="h-4 w-4 ml-2" />
            حذف المحدد ({selectedIds.length})
          </Button>
        )}
      </div>

      {/* Table */}
      {!logs || logs.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground">لا توجد سجلات متاحة</p>
        </div>
      ) : (
        <>
          {/* Desktop view - Table */}
          <div className="hidden lg:block rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {onBulkDelete && (
                      <TableHead className="text-right w-12">
                        <Checkbox
                          checked={isAllSelected}
                          onCheckedChange={handleSelectAll}
                          data-testid="checkbox-select-all"
                          aria-label="تحديد الكل"
                        />
                      </TableHead>
                    )}
                    <TableHead className="text-right">التاريخ/الوقت</TableHead>
                    <TableHead className="text-right">البريد</TableHead>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">الموضوع</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">معرف المقال</TableHead>
                    <TableHead className="text-right">جودة AI</TableHead>
                    <TableHead className="text-right">اللغة</TableHead>
                    <TableHead className="text-right">المرفقات</TableHead>
                    {onDelete && <TableHead className="text-right w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow
                      key={log.id}
                      onClick={() => onRowClick?.(log)}
                      className="cursor-pointer hover-elevate"
                      data-testid={`row-log-${log.id}`}
                    >
                      {onBulkDelete && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.includes(log.id)}
                            onCheckedChange={(checked) =>
                              handleSelectLog(log.id, checked as boolean)
                            }
                            data-testid={`checkbox-log-${log.id}`}
                            aria-label={`تحديد السجل ${log.id}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.receivedAt), "dd MMM yyyy HH:mm", {
                          locale: ar,
                        })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.fromEmail}
                      </TableCell>
                      <TableCell>{log.fromName || "-"}</TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        {log.subject}
                      </TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell>
                        {log.articleId ? (
                          <code className="text-xs px-1.5 py-0.5 bg-muted rounded">
                            {log.articleId.slice(0, 8)}
                          </code>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {log.aiAnalysis?.contentQuality ? (
                          <Badge
                            variant="outline"
                            className={
                              log.aiAnalysis.contentQuality >= 70
                                ? "border-emerald-500 text-emerald-700"
                                : log.aiAnalysis.contentQuality >= 50
                                ? "border-amber-500 text-amber-700"
                                : "border-red-500 text-red-700"
                            }
                          >
                            {log.aiAnalysis.contentQuality}%
                          </Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {getLanguageName(log.aiAnalysis?.languageDetected)}
                      </TableCell>
                      <TableCell>
                        {log.attachmentsCount !== undefined && log.attachmentsCount > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{log.attachmentsCount}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      {onDelete && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => handleDelete(e, log.id)}
                            data-testid={`button-delete-${log.id}`}
                            aria-label={`حذف السجل ${log.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile view - Cards */}
          <div className="lg:hidden space-y-4">
            {logs.map((log) => (
              <div
                key={log.id}
                onClick={() => onRowClick?.(log)}
                className="rounded-lg border p-4 space-y-3 cursor-pointer hover-elevate"
                data-testid={`card-log-${log.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {getStatusBadge(log.status)}
                      {log.aiAnalysis?.contentQuality && (
                        <Badge
                          variant="outline"
                          className={
                            log.aiAnalysis.contentQuality >= 70
                              ? "border-emerald-500 text-emerald-700"
                              : log.aiAnalysis.contentQuality >= 50
                              ? "border-amber-500 text-amber-700"
                              : "border-red-500 text-red-700"
                          }
                        >
                          {log.aiAnalysis.contentQuality}%
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm mb-1 line-clamp-2">
                      {log.subject}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(log.receivedAt), "dd MMM yyyy HH:mm", {
                        locale: ar,
                      })}
                    </p>
                  </div>
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDelete(e, log.id)}
                      data-testid={`button-delete-${log.id}`}
                      aria-label={`حذف السجل ${log.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">من:</span>
                    <span className="text-xs font-medium truncate max-w-[200px]">
                      {log.fromEmail}
                    </span>
                  </div>

                  {log.fromName && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">الاسم:</span>
                      <span className="text-xs">{log.fromName}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">اللغة:</span>
                    <span className="text-xs">
                      {getLanguageName(log.aiAnalysis?.languageDetected)}
                    </span>
                  </div>

                  {log.articleId && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">معرف المقال:</span>
                      <code className="text-xs px-1.5 py-0.5 bg-muted rounded">
                        {log.articleId.slice(0, 8)}
                      </code>
                    </div>
                  )}

                  {log.attachmentsCount !== undefined && log.attachmentsCount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">المرفقات:</span>
                      <div className="flex items-center gap-1.5">
                        <Paperclip className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs font-medium">{log.attachmentsCount}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                عرض {(currentPage - 1) * pageSize + 1} -{" "}
                {Math.min(currentPage * pageSize, totalCount)} من {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange?.(currentPage - 1)}
                  disabled={currentPage === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  صفحة {currentPage} من {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange?.(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
