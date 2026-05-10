import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";

export default function GulfLiveBlock() {
  return (
    <Card className="overflow-hidden" data-testid="gulf-live-block">
      <div className="border-b bg-muted/40 px-4 py-2.5 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
        <span className="font-semibold text-sm">تغطية حية</span>
        <span className="text-muted-foreground text-xs hidden sm:inline">· الاعتداءات على دول الخليج</span>
      </div>
      <div className="px-4 py-2.5 bg-muted/30">
        <Link href="/gulf-live" className="w-full">
          <Button variant="ghost" size="sm" className="w-full gap-1" data-testid="button-gulf-live-link">
            تابع التغطية الحية
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
