import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { randomBytes } from 'crypto';

authenticator.options = {
  window: 1, // Allow 1 step (30 seconds) before/after current time
};

export interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export function generateSecret(): string {
  return authenticator.generateSecret();
}

export async function generateQRCode(email: string, secret: string): Promise<string> {
  const appName = 'سبق الذكية';
  const otpauth = authenticator.keyuri(email, appName, secret);
  
  try {
    const qrCode = await QRCode.toDataURL(otpauth);
    return qrCode;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('فشل في إنشاء رمز QR');
  }
}

export function verifyToken(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch (error) {
    console.error('Error verifying token:', error);
    return false;
  }
}

export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  
  for (let i = 0; i < count; i++) {
    const code = randomBytes(4).toString('hex').toUpperCase();
    const formatted = `${code.slice(0, 4)}-${code.slice(4, 8)}`;
    codes.push(formatted);
  }
  
  return codes;
}

export function verifyBackupCode(backupCodes: string[], code: string): { valid: boolean; remainingCodes?: string[] } {
  if (!backupCodes || backupCodes.length === 0) {
    return { valid: false };
  }
  
  const normalizedInput = code.toUpperCase().replace(/[\s-]/g, '');
  const codeIndex = backupCodes.findIndex(storedCode => {
    const normalized = storedCode.toUpperCase().replace(/[\s-]/g, '');
    return normalized === normalizedInput;
  });
  
  if (codeIndex === -1) {
    return { valid: false };
  }
  
  const remainingCodes = backupCodes.filter((_, index) => index !== codeIndex);
  return { valid: true, remainingCodes };
}
