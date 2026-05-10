import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Mail } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function VerifyEmail() {
  const [location, navigate] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);

  // Get token from URL
  const token = new URLSearchParams(window.location.search).get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('رابط التحقق غير صالح');
      return;
    }

    // Verify email
    const verifyEmail = async () => {
      try {
        const data = await apiRequest('/api/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });

        // If apiRequest succeeds, it means verification was successful
        setStatus('success');
        setMessage(data.message || 'تم التحقق من بريدك الإلكتروني بنجاح!');
        
        // Invalidate user cache
        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        
        // Redirect to home after 3 seconds
        setTimeout(() => navigate('/'), 3000);
      } catch (error: any) {
        setStatus('error');
        setMessage(error.message || 'حدث خطأ أثناء التحقق من البريد الإلكتروني');
        console.error('Email verification error:', error);
      }
    };

    verifyEmail();
  }, [token, navigate]);

  const handleResend = async () => {
    setResending(true);
    try {
      const data = await apiRequest('/api/auth/resend-verification', {
        method: 'POST',
      });

      // If apiRequest succeeds, show success message
      setMessage(data.message || 'تم إرسال رسالة التحقق بنجاح. يرجى فحص بريدك الإلكتروني');
    } catch (error: any) {
      setMessage(error.message || 'حدث خطأ أثناء إرسال رسالة التحقق');
      console.error('Resend verification error:', error);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-muted/20 to-background">
      <Card className="w-full max-w-md" data-testid="verify-email-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {status === 'loading' && (
              <Loader2 className="w-16 h-16 text-primary animate-spin" data-testid="loading-spinner" />
            )}
            {status === 'success' && (
              <CheckCircle2 className="w-16 h-16 text-green-500" data-testid="success-icon" />
            )}
            {status === 'error' && (
              <XCircle className="w-16 h-16 text-destructive" data-testid="error-icon" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {status === 'loading' && 'جاري التحقق...'}
            {status === 'success' && 'تم التحقق بنجاح!'}
            {status === 'error' && 'فشل التحقق'}
          </CardTitle>
          <CardDescription data-testid="verification-message">
            {message}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === 'success' && (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                سيتم توجيهك إلى الصفحة الرئيسية خلال لحظات...
              </p>
              <Link href="/">
                <Button className="w-full" data-testid="button-go-home">
                  الذهاب إلى الصفحة الرئيسية
                </Button>
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <Button 
                onClick={handleResend} 
                disabled={resending}
                className="w-full"
                variant="outline"
                data-testid="button-resend-verification"
              >
                {resending ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جاري الإرسال...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 ml-2" />
                    إعادة إرسال رسالة التحقق
                  </>
                )}
              </Button>

              <Link href="/">
                <Button variant="ghost" className="w-full" data-testid="button-back-home">
                  العودة إلى الصفحة الرئيسية
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
