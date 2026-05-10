import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Copy, User, Clock, Database, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { getActionPresentation, getEntityTypeLabel } from "@/lib/activityUtils";

interface ActivityLogDrawerProps {
  log?: {
    id: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    oldValue: Record<string, any> | null;
    newValue: Record<string, any> | null;
    metadata: { ip?: string; userAgent?: string; reason?: string } | null;
    createdAt: Date | string;
    user?: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
    } | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ActivityLogDrawer({ log, open, onOpenChange }: ActivityLogDrawerProps) {
  const { toast } = useToast();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "تم النسخ",
      description: `تم نسخ ${label} بنجاح`,
    });
  };

  const copyJSON = () => {
    if (!log) return;
    const json = JSON.stringify(log, null, 2);
    copyToClipboard(json, "بيانات JSON");
  };

  if (!log) return null;

  const userName = log.user
    ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || log.user.email
    : 'مستخدم محذوف';

  const userInitials = log.user
    ? `${log.user.firstName?.[0] || ''}${log.user.lastName?.[0] || ''}` || log?.user?.email?.[0]
    : 'U';

  const createdAt = typeof log.createdAt === 'string' ? new Date(log.createdAt) : log.createdAt;

  const actionPresentation = getActionPresentation(log.action);
  const ActionIcon = actionPresentation.icon;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[540px] overflow-y-auto" side="left" dir="rtl" data-testid="activity-log-drawer">
        <SheetHeader className="text-right">
          <SheetTitle className="flex items-center gap-2 justify-end">
            <span>تفاصيل سجل النشاط</span>
            <div className={`p-1.5 rounded-full ${actionPresentation.bgColor} ${actionPresentation.textColor}`}>
              <ActionIcon className="h-5 w-5" />
            </div>
          </SheetTitle>
          <SheetDescription className="text-right">
            معلومات كاملة عن العملية المنفذة
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6" dir="rtl">
          {/* User Information */}
          <div data-testid="drawer-user-section">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2 justify-end text-right">
              <span>المستخدم</span>
              <User className="h-4 w-4" />
            </h3>
            <div className="flex items-center gap-3 p-3 rounded-md border">
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={log.user?.profileImageUrl || undefined} />
                <AvatarFallback>{userInitials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{userName}</p>
                {log.user && (
                  <p className="text-xs text-muted-foreground truncate" dir="ltr">{log.user.email}</p>
                )}
              </div>
              {log.userId && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(log.userId!, 'معرف المستخدم')}
                  data-testid="button-copy-user-id"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Action Information */}
          <div data-testid="drawer-action-section">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2 justify-end text-right">
              <span>معلومات العملية</span>
              <div className={`p-1 rounded-full ${actionPresentation.bgColor} ${actionPresentation.textColor}`}>
                <ActionIcon className="h-4 w-4" />
              </div>
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                <span className="text-sm text-muted-foreground">نوع العملية</span>
                <Badge variant={actionPresentation.badgeVariant} data-testid="badge-action">
                  {actionPresentation.label}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                <span className="text-sm text-muted-foreground">نوع الكيان</span>
                <span className="text-sm font-medium">{getEntityTypeLabel(log.entityType)}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                <span className="text-sm text-muted-foreground">معرف الكيان</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(log.entityId, 'معرف الكيان')}
                    data-testid="button-copy-entity-id"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <code className="text-xs bg-background px-2 py-1 rounded" dir="ltr">{log.entityId}</code>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Timestamp */}
          <div data-testid="drawer-time-section">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2 justify-end text-right">
              <span>التوقيت</span>
              <Clock className="h-4 w-4" />
            </h3>
            <div className="p-3 rounded-md border text-right">
              <p className="text-sm">
                {format(createdAt, 'PPpp', { locale: ar })}
              </p>
            </div>
          </div>

          {/* Metadata */}
          {log.metadata && (
            <>
              <Separator />
              <div data-testid="drawer-metadata-section">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2 justify-end text-right">
                  <span>معلومات إضافية</span>
                  <Database className="h-4 w-4" />
                </h3>
                <div className="space-y-2">
                  {log.metadata.ip && (
                    <div className="p-2 rounded-md bg-muted/50 text-right">
                      <span className="text-xs text-muted-foreground">عنوان IP:</span>
                      <code className="text-xs mr-2" dir="ltr">{log.metadata.ip}</code>
                    </div>
                  )}
                  {log.metadata.userAgent && (
                    <div className="p-2 rounded-md bg-muted/50 text-right">
                      <span className="text-xs text-muted-foreground">المتصفح:</span>
                      <p className="text-xs mt-1 break-all" dir="ltr">{log.metadata.userAgent}</p>
                    </div>
                  )}
                  {log.metadata.reason && (
                    <div className="p-2 rounded-md bg-muted/50 text-right">
                      <span className="text-xs text-muted-foreground">السبب:</span>
                      <p className="text-xs mt-1">{log.metadata.reason}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Old and New Values */}
          {(log.oldValue || log.newValue) && (
            <>
              <Separator />
              <div data-testid="drawer-values-section">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2 justify-end text-right">
                  <span>التغييرات</span>
                  <FileText className="h-4 w-4" />
                </h3>
                <div className="space-y-4">
                  {log.oldValue && (
                    <div className="text-right">
                      <p className="text-xs font-medium text-muted-foreground mb-2">القيمة القديمة:</p>
                      <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto" dir="ltr">
                        {JSON.stringify(log.oldValue, null, 2)}
                      </pre>
                    </div>
                  )}
                  {log.newValue && (
                    <div className="text-right">
                      <p className="text-xs font-medium text-muted-foreground mb-2">القيمة الجديدة:</p>
                      <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto" dir="ltr">
                        {JSON.stringify(log.newValue, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <Separator />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={copyJSON}
              data-testid="button-copy-json"
            >
              <Copy className="h-4 w-4 ml-2" />
              نسخ JSON
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
