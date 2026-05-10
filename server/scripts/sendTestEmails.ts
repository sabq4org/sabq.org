/**
 * Script to send test email templates to a specified email address
 * Usage: npx tsx server/scripts/sendTestEmails.ts aalhazmi@sabq.org
 */

import { sendEmailNotification } from '../services/email';

const targetEmail = process.argv[2] || 'aalhazmi@sabq.org';

async function sendTestEmails() {
  console.log(`\n📧 Sending test email templates to: ${targetEmail}\n`);

  const results: { template: string; success: boolean; error?: string }[] = [];

  // 1. Welcome Email for New Registrant (رسالة الترحيب بمسجل جديد)
  console.log('1️⃣ Sending: رسالة الترحيب بمسجل جديد...');
  const welcomeHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
        .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: white; font-size: 28px; margin: 0; font-weight: bold; }
        .content { padding: 40px 30px; text-align: right; }
        .content h2 { color: #333; font-size: 22px; margin-bottom: 16px; }
        .content p { color: #666; font-size: 16px; line-height: 1.8; margin-bottom: 16px; }
        .button { display: inline-block; background: #0066cc; color: white !important; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 18px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f9f9f9; padding: 24px 30px; text-align: center; color: #999; font-size: 14px; border-top: 1px solid #eee; }
        .features { background: #f0f9ff; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .feature-item { display: flex; align-items: center; margin-bottom: 12px; }
        .feature-icon { font-size: 20px; margin-left: 12px; }
        .en-section { direction: ltr; text-align: left; margin-top: 24px; padding-top: 24px; border-top: 2px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <p style="font-size: 48px; margin-bottom: 8px;">🎉</p>
          <h1>مرحباً بك في صحيفة سبق!</h1>
        </div>
        
        <div class="content">
          <h2>أهلاً بك في عائلة سبق!</h2>
          <p>شكراً لانضمامك إلى صحيفة سبق الإلكترونية - المصدر الأول للأخبار.</p>
          
          <div class="features">
            <h3 style="margin: 0 0 16px 0; color: #0066cc;">ما يمكنك فعله الآن:</h3>
            <div class="feature-item">
              <span class="feature-icon">📰</span>
              <span>تصفح آخر الأخبار والتحديثات اللحظية</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">⭐</span>
              <span>احفظ المقالات المفضلة لقراءتها لاحقاً</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">💬</span>
              <span>شارك برأيك وتفاعل مع المجتمع</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🔔</span>
              <span>تلقَّ إشعارات فورية للأخبار المهمة</span>
            </div>
          </div>
          
          <p style="text-align: center;">
            <a href="https://sabq.org" class="button">ابدأ التصفح الآن</a>
          </p>

          <div class="en-section">
            <h2>Welcome to Sabq!</h2>
            <p>Thank you for joining Sabq News - Saudi Arabia's leading news source. Start exploring the latest news and enjoy personalized recommendations.</p>
          </div>
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية - Sabq News</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const welcomeResult = await sendEmailNotification({
    to: targetEmail,
    subject: '🎉 مرحباً بك في صحيفة سبق! - Welcome to Sabq!',
    html: welcomeHtml,
  });
  results.push({ template: 'رسالة الترحيب بمسجل جديد', success: welcomeResult.success, error: welcomeResult.error });
  console.log(welcomeResult.success ? '   ✅ Success' : `   ❌ Failed: ${welcomeResult.error}`);

  // 2. Verification/Activation Email (رسالة التفعيل)
  console.log('2️⃣ Sending: رسالة التفعيل...');
  const verificationHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
        .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: white; font-size: 28px; margin: 0; font-weight: bold; }
        .content { padding: 40px 30px; text-align: right; }
        .content h2 { color: #333; font-size: 22px; margin-bottom: 16px; }
        .content p { color: #666; font-size: 16px; line-height: 1.8; margin-bottom: 16px; }
        .button { display: inline-block; background: #0066cc; color: white !important; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 18px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f9f9f9; padding: 24px 30px; text-align: center; color: #999; font-size: 14px; border-top: 1px solid #eee; }
        .en-section { direction: ltr; text-align: left; margin-top: 24px; padding-top: 24px; border-top: 2px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🧠 صحيفة سبق الإلكترونية</h1>
        </div>
        
        <div class="content">
          <h2>مرحباً بك في سبق!</h2>
          <p>شكراً لتسجيلك في صحيفة سبق الإلكترونية. لتفعيل حسابك والاستمتاع بجميع المزايا، يرجى تأكيد بريدك الإلكتروني.</p>
          
          <p style="text-align: center;">
            <a href="https://sabq.org/verify-email?token=EXAMPLE_TOKEN" class="button">
              ✓ تفعيل الحساب
            </a>
          </p>
          
          <p style="color: #999; font-size: 14px;">
            أو انسخ الرابط التالي والصقه في المتصفح:<br>
            <span style="color: #0066cc; word-break: break-all;">https://sabq.org/verify-email?token=EXAMPLE_TOKEN</span>
          </p>
          
          <p style="font-size: 14px; color: #999; margin-top: 24px;">
            ⏰ هذا الرابط صالح لمدة 24 ساعة فقط
          </p>

          <div class="en-section">
            <h2>Welcome to Sabq!</h2>
            <p>Thank you for registering with Sabq News. To activate your account and enjoy all features, please confirm your email address.</p>
            <p style="color: #999; font-size: 13px;">
              Or copy and paste this link into your browser:<br>
              <span style="color: #0066cc; word-break: break-all;">https://sabq.org/verify-email?token=EXAMPLE_TOKEN</span>
            </p>
            <p style="font-size: 13px; color: #999; margin-top: 16px;">
              ⏰ This link is valid for 24 hours only
            </p>
          </div>
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية - Sabq News</p>
          <p style="font-size: 12px; margin-top: 8px;">إذا لم تقم بالتسجيل، يرجى تجاهل هذه الرسالة</p>
          <p style="font-size: 12px; margin-top: 4px;">If you didn't sign up, please ignore this email</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const verificationResult = await sendEmailNotification({
    to: targetEmail,
    subject: 'تفعيل حسابك في صحيفة سبق - Activate Your Sabq Account',
    html: verificationHtml,
  });
  results.push({ template: 'رسالة التفعيل', success: verificationResult.success, error: verificationResult.error });
  console.log(verificationResult.success ? '   ✅ Success' : `   ❌ Failed: ${verificationResult.error}`);

  // 3. Password Reset Email (رسالة استعادة الرقم السري)
  console.log('3️⃣ Sending: رسالة استعادة الرقم السري...');
  const passwordResetHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
        .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: white; font-size: 28px; margin: 0; font-weight: bold; }
        .content { padding: 40px 30px; text-align: right; }
        .content h2 { color: #333; font-size: 22px; margin-bottom: 16px; }
        .content p { color: #666; font-size: 16px; line-height: 1.8; margin-bottom: 16px; }
        .button { display: inline-block; background: #dc2626; color: white !important; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 18px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f9f9f9; padding: 24px 30px; text-align: center; color: #999; font-size: 14px; border-top: 1px solid #eee; }
        .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0; color: #92400e; }
        .en-section { direction: ltr; text-align: left; margin-top: 24px; padding-top: 24px; border-top: 2px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 إعادة تعيين كلمة المرور</h1>
        </div>
        
        <div class="content">
          <h2>طلب إعادة تعيين كلمة المرور</h2>
          <p>تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك في صحيفة سبق الإلكترونية.</p>
          
          <p style="text-align: center;">
            <a href="https://sabq.org/reset-password?token=EXAMPLE_TOKEN" class="button">
              🔑 إعادة تعيين كلمة المرور
            </a>
          </p>
          
          <p style="color: #999; font-size: 14px;">
            أو انسخ الرابط التالي والصقه في المتصفح:<br>
            <span style="color: #dc2626; word-break: break-all;">https://sabq.org/reset-password?token=EXAMPLE_TOKEN</span>
          </p>
          
          <div class="warning">
            ⚠️ هذا الرابط صالح لمدة ساعة واحدة فقط. إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذه الرسالة.
          </div>

          <div class="en-section">
            <h2>Password Reset Request</h2>
            <p>We received a request to reset the password for your Sabq News account.</p>
            <p style="color: #999; font-size: 13px;">
              Or copy and paste this link into your browser:<br>
              <span style="color: #dc2626; word-break: break-all;">https://sabq.org/reset-password?token=EXAMPLE_TOKEN</span>
            </p>
            <p style="font-size: 13px; color: #92400e; background: #fef3c7; padding: 12px; border-radius: 6px; margin-top: 16px;">
              ⚠️ This link is valid for 1 hour only. If you didn't request a password reset, please ignore this email.
            </p>
          </div>
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية - Sabq News</p>
          <p style="font-size: 12px; margin-top: 8px;">لأسباب أمنية، لا نشارك كلمات المرور عبر البريد الإلكتروني</p>
          <p style="font-size: 12px; margin-top: 4px;">For security reasons, we never share passwords via email</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const passwordResetResult = await sendEmailNotification({
    to: targetEmail,
    subject: 'إعادة تعيين كلمة المرور - Password Reset | سبق',
    html: passwordResetHtml,
  });
  results.push({ template: 'رسالة استعادة الرقم السري', success: passwordResetResult.success, error: passwordResetResult.error });
  console.log(passwordResetResult.success ? '   ✅ Success' : `   ❌ Failed: ${passwordResetResult.error}`);

  // 4. Interests Completion Email (رسالة اتمام تسجيل الاهتمامات)
  console.log('4️⃣ Sending: رسالة اتمام تسجيل الاهتمامات...');
  const interestsCompletionHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
        .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #10b981, #059669); padding: 40px 20px; text-align: center; }
        .header h1 { color: white; font-size: 28px; margin: 0; font-weight: bold; }
        .content { padding: 40px 30px; text-align: right; }
        .content h2 { color: #1f2937; font-size: 22px; margin-bottom: 16px; }
        .content p { color: #4b5563; font-size: 16px; line-height: 1.8; margin-bottom: 16px; }
        .highlight-box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .highlight-box h3 { color: #166534; margin: 0 0 12px 0; font-size: 16px; }
        .highlight-box p { color: #15803d; margin: 0; font-size: 14px; }
        .interests-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .interest-tag { background: #dcfce7; color: #166534; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 500; }
        .schedule-item { display: flex; align-items: center; margin-bottom: 12px; padding: 12px; background: #f9fafb; border-radius: 8px; }
        .schedule-icon { font-size: 24px; margin-left: 12px; }
        .schedule-text { flex: 1; }
        .schedule-text strong { color: #1f2937; display: block; }
        .schedule-text span { color: #6b7280; font-size: 14px; }
        .footer { background: #f9f9f9; padding: 24px 30px; text-align: center; color: #999; font-size: 14px; border-top: 1px solid #eee; }
        .en-section { direction: ltr; text-align: left; margin-top: 24px; padding-top: 24px; border-top: 2px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <p style="font-size: 48px; margin-bottom: 8px;">✅</p>
          <h1>تم تسجيل اهتماماتك بنجاح!</h1>
        </div>
        
        <div class="content">
          <h2>مرحباً بك في تجربة أخبار مخصصة!</h2>
          <p>شكراً لاستكمال تسجيل اهتماماتك. الآن ستصلك الأخبار التي تهمك فعلاً.</p>
          
          <div class="highlight-box">
            <h3>📌 اهتماماتك المختارة:</h3>
            <div class="interests-grid">
              <span class="interest-tag">سياسة</span>
              <span class="interest-tag">اقتصاد</span>
              <span class="interest-tag">رياضة</span>
              <span class="interest-tag">تقنية</span>
              <span class="interest-tag">ثقافة</span>
            </div>
          </div>
          
          <h3 style="color: #1f2937; margin-bottom: 16px;">🎯 ما يمكنك توقعه:</h3>
          
          <div class="schedule-item">
            <span class="schedule-icon">📰</span>
            <div class="schedule-text">
              <strong>أخبار مخصصة</strong>
              <span>ستظهر الأخبار المتعلقة باهتماماتك أولاً</span>
            </div>
          </div>
          
          <div class="schedule-item">
            <span class="schedule-icon">🔔</span>
            <div class="schedule-text">
              <strong>إشعارات ذكية</strong>
              <span>إشعارات فقط للأخبار المهمة في مجالاتك</span>
            </div>
          </div>
          
          <div class="schedule-item">
            <span class="schedule-icon">📧</span>
            <div class="schedule-text">
              <strong>نشرة مخصصة</strong>
              <span>ملخص يومي يناسب اهتماماتك</span>
            </div>
          </div>
          
          <p style="text-align: center; margin-top: 30px;">
            <a href="https://sabq.org" style="background: #10b981; color: white !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; display: inline-block;">
              استكشف الأخبار المخصصة لك
            </a>
          </p>

          <div class="en-section">
            <h2>Your Interests Have Been Saved!</h2>
            <p>Thank you for completing your interests registration. Now you'll receive news that truly matters to you.</p>
            <p><strong>Selected interests:</strong> Politics, Economy, Sports, Technology, Culture</p>
            <p>You can update your interests anytime from your profile settings.</p>
          </div>
        </div>
        
        <div class="footer">
          <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية - Sabq News</p>
          <p style="margin-top: 8px; font-size: 12px; color: #9ca3af;">
            يمكنك تعديل اهتماماتك في أي وقت من إعدادات حسابك
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const interestsResult = await sendEmailNotification({
    to: targetEmail,
    subject: '✅ تم تسجيل اهتماماتك بنجاح! | سبق',
    html: interestsCompletionHtml,
  });
  results.push({ template: 'رسالة اتمام تسجيل الاهتمامات', success: interestsResult.success, error: interestsResult.error });
  console.log(interestsResult.success ? '   ✅ Success' : `   ❌ Failed: ${interestsResult.error}`);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary:');
  console.log('='.repeat(50));
  
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  results.forEach((r, i) => {
    console.log(`${r.success ? '✅' : '❌'} ${r.template}`);
    if (r.error) console.log(`   Error: ${r.error}`);
  });
  
  console.log('='.repeat(50));
  console.log(`Total: ${successCount}/${totalCount} emails sent successfully`);
  console.log(`Target: ${targetEmail}`);
  console.log('='.repeat(50) + '\n');

  process.exit(successCount === totalCount ? 0 : 1);
}

sendTestEmails().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
