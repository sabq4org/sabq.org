import { useState } from "react";
import { PromptStudioPanel } from "@/components/PromptStudioPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wand2, Lock } from "lucide-react";

const STORAGE_KEY = "sabq.prompt-studio.pw";

export default function PromptStudioPublic() {
  const [password, setPassword] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [input, setInput] = useState("");

  const unlock = () => {
    const pw = input.trim();
    if (!pw) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, pw);
    } catch {
      /* ignore storage errors */
    }
    setPassword(pw);
  };

  const reset = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setPassword(null);
    setInput("");
  };

  if (!password) {
    return (
      <div
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-muted/30 p-4"
      >
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle>مختبر البرومبت</CardTitle>
            <CardDescription>أدخل كلمة السر للوصول إلى الأداة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pw">كلمة السر</Label>
              <Input
                id="pw"
                type="password"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") unlock();
                }}
                placeholder="••••••••"
                autoFocus
              />
            </div>
            <Button className="w-full" onClick={unlock} disabled={!input.trim()}>
              دخول
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">مختبر البرومبت</h1>
              <p className="text-xs text-muted-foreground">
                تحسين التعليمات وفق دليل Anthropic
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={reset}>
            خروج
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <PromptStudioPanel
          endpoint="/api/prompt-studio/optimize-public"
          extraBody={{ password }}
          showHeader={false}
          onAuthError={reset}
        />
      </main>
    </div>
  );
}
