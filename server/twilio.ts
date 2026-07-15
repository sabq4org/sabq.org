import twilio from 'twilio';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
  };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

/**
 * Send OTP via SMS using Twilio Verify
 */
export async function sendSMSOTP(phoneNumber: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!process.env.TWILIO_VERIFY_SID) {
      console.error('❌ TWILIO_VERIFY_SID is not configured');
      throw new Error('TWILIO_VERIFY_SID environment variable is not configured');
    }

    const client = await getTwilioClient();
    
    console.log('📱 Sending SMS OTP to:', phoneNumber);
    console.log('📱 Using Verify Service SID:', process.env.TWILIO_VERIFY_SID.substring(0, 10) + '...');
    
    // Use Twilio Verify API to send OTP.
    // Optional TWILIO_VERIFY_TEMPLATE_SID: approved custom template whose
    // last line is `@sabq.org #{{code}}` so iOS AutoFill (domain-bound)
    // can suggest the code in the app. Without it, Verify's default
    // template is used and AutoFill is unreliable (esp. Arabic SMS).
    const createParams: { to: string; channel: "sms"; templateSid?: string } = {
      to: phoneNumber,
      channel: "sms",
    };
    const templateSid = process.env.TWILIO_VERIFY_TEMPLATE_SID?.trim();
    if (templateSid) {
      createParams.templateSid = templateSid;
    }

    const verification = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verifications
      .create(createParams);

    console.log('✅ SMS OTP sent successfully:', { 
      to: phoneNumber, 
      status: verification.status,
      sid: verification.sid 
    });

    return {
      success: verification.status === 'pending',
      message: verification.status === 'pending' 
        ? 'تم إرسال رمز التحقق إلى رقم جوالك'
        : 'فشل في إرسال رمز التحقق'
    };
  } catch (error: any) {
    console.error('❌ Error sending SMS OTP:', {
      message: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo
    });
    
    // Provide more specific error messages based on Twilio error codes
    let errorMessage = 'فشل في إرسال رمز التحقق';
    
    if (error.code === 60200) {
      errorMessage = 'رقم الجوال غير صحيح أو غير مدعوم. تأكد من إدخال الرقم بالصيغة الدولية (مثال: +966xxxxxxxxx)';
    } else if (error.code === 60202) {
      errorMessage = 'تم تجاوز الحد الأقصى لمحاولات الإرسال. حاول مرة أخرى لاحقاً';
    } else if (error.code === 60203) {
      errorMessage = 'رقم الجوال غير صالح';
    } else if (error.code === 60205) {
      errorMessage = 'خدمة التحقق غير متاحة حالياً. حاول مرة أخرى لاحقاً';
    } else if (error.code === 20003) {
      errorMessage = 'تعذر الوصول إلى خدمة Twilio. تحقق من إعدادات TWILIO_VERIFY_SID';
    }
    
    return {
      success: false,
      message: errorMessage
    };
  }
}

/**
 * Verify OTP code sent via SMS
 */
export async function verifySMSOTP(phoneNumber: string, code: string): Promise<{ valid: boolean; message: string }> {
  try {
    if (!process.env.TWILIO_VERIFY_SID) {
      throw new Error('TWILIO_VERIFY_SID environment variable is not configured');
    }

    const client = await getTwilioClient();
    
    console.log('🔍 Verifying SMS OTP for:', phoneNumber);
    
    const verificationCheck = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verificationChecks
      .create({
        to: phoneNumber,
        code: code
      });

    console.log('✅ SMS OTP verification result:', { to: phoneNumber, status: verificationCheck.status });

    return {
      valid: verificationCheck.status === 'approved',
      message: verificationCheck.status === 'approved'
        ? 'تم التحقق بنجاح'
        : 'الرمز غير صحيح أو منتهي الصلاحية'
    };
  } catch (error: any) {
    console.error('❌ Error verifying SMS OTP:', error.message || error);
    return {
      valid: false,
      message: 'الرمز غير صحيح أو منتهي الصلاحية'
    };
  }
}
