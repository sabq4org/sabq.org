import { PassBuilder, PressPassData } from './PassBuilder';
import { PKPass } from 'passkit-generator';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class PressPassBuilder extends PassBuilder {
  constructor(passTypeId: string, teamId: string) {
    super(passTypeId, teamId);
  }
  
  getTemplatePath(): string {
    // Always use the source template, not the dist version
    return path.resolve(process.cwd(), 'server/lib/passkit/pass-template.pass');
  }
  
  getPassDescription(): string {
    return 'Sabq Smart Press Card';
  }
  
  getOrganizationName(): string {
    return 'سبق الذكية';
  }
  
  // 2026-05-19 redesign: white card with Sabq red accents.
  // - background: pure white (clean, official ID-card feel)
  // - foreground (field VALUES): deep navy for readability
  // - labels:   Sabq signature red — gives the brand cue without
  //              needing a literal stripe across the body
  // The coupon-style pass.json also pulls in strip.png (a thin red
  // band) which sits between the header row and the primary field.
  protected getBackgroundColor(): string {
    return 'rgb(255, 255, 255)';
  }

  protected getForegroundColor(): string {
    return 'rgb(26, 34, 54)';
  }

  protected getLabelColor(): string {
    return 'rgb(160, 53, 58)';
  }
  
  configurePassFields(pass: PKPass, data: PressPassData): void {
    pass.headerFields.push({
      key: 'role',
      label: 'الدور',
      value: this.translateRole(data.userRole),
    });
    
    pass.primaryFields.push({
      key: 'name',
      label: 'الاسم',
      value: data.userName,
    });
    
    if (data.jobTitle) {
      pass.secondaryFields.push({
        key: 'job_title',
        label: 'المنصب',
        value: data.jobTitle,
      });
    }
    
    if (data.department) {
      pass.secondaryFields.push({
        key: 'department',
        label: 'القسم',
        value: data.department,
      });
    }
    
    if (data.pressIdNumber) {
      pass.auxiliaryFields.push({
        key: 'press_id',
        label: 'رقم البطاقة الصحفية',
        value: data.pressIdNumber,
      });
    }
    
    if (data.validUntil) {
      pass.auxiliaryFields.push({
        key: 'valid_until',
        label: 'صالحة حتى',
        value: data.validUntil.toLocaleDateString('ar-SA-u-ca-gregory'),
      });
    }
    
    pass.backFields.push(
      {
        key: 'description',
        label: 'عن البطاقة',
        value: 'بطاقة هوية صحفية رسمية صادرة من منصة سبق الذكية',
      },
      {
        key: 'website',
        label: 'الموقع الإلكتروني',
        value: 'https://sabq.org',
      }
    );
  }
  
  private translateRole(role: string): string {
    // Roles eligible for the Apple Wallet press pass on the v1 mobile
    // route. Keep this map in sync with the eligibility check there
    // (server/routes/mobileApiRoutes.ts) so a user who can request a
    // pass also gets a meaningful Arabic role label on it.
    const roleMap: Record<string, string> = {
      admin: 'مدير',
      system_admin: 'مدير النظام',
      chief_editor: 'رئيس التحرير',
      editor: 'محرر',
      journalist: 'صحفي',
      reporter: 'مراسل',
      opinion_author: 'كاتب رأي',
      publisher: 'ناشر',
      reader: 'قارئ',
    };
    return roleMap[role] || role;
  }
}
