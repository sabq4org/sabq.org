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
  
  // 2026-05-19 redesign (revision 2): clean white card, Sabq sky-blue
  // labels, navy values. Sabq's official brand color isn't red — it's
  // the azure derived from the web primary HSL(203.89,88.28%,53.14%)
  // (~#1CA4F0), which is what users see across the app. Apple Wallet
  // renders generic-style passes without a colored strip area, so the
  // brand cue here comes from the label color + the Sabq logo
  // anchored top-right via thumbnail.png. Earlier `coupon`-style
  // attempt blew the strip image up into a hero band — confirmed
  // unwanted, reverted to generic.
  protected getBackgroundColor(): string {
    return 'rgb(255, 255, 255)';
  }

  protected getForegroundColor(): string {
    return 'rgb(26, 34, 54)';
  }

  protected getLabelColor(): string {
    return 'rgb(28, 164, 240)';
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
