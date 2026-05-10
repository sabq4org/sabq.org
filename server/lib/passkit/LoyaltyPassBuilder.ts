import { PassBuilder, LoyaltyPassData } from './PassBuilder';
import { PKPass } from 'passkit-generator';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class LoyaltyPassBuilder extends PassBuilder {
  constructor(passTypeId: string, teamId: string) {
    super(passTypeId, teamId);
  }
  
  getTemplatePath(): string {
    // Always use the source template, not the dist version
    return path.resolve(process.cwd(), 'server/lib/passkit/loyalty-pass-template.pass');
  }
  
  getPassDescription(): string {
    return 'Sabq Smart Loyalty Card';
  }
  
  getOrganizationName(): string {
    return 'سبق الذكية';
  }
  
  protected getBackgroundColor(): string {
    return 'rgb(212, 175, 55)';
  }
  
  configurePassFields(pass: PKPass, data: LoyaltyPassData): void {
    pass.headerFields.push({
      key: 'rank',
      label: 'المستوى',
      value: data.currentRank,
    });
    
    pass.primaryFields.push({
      key: 'name',
      label: 'الاسم',
      value: data.userName,
    });
    
    pass.secondaryFields.push({
      key: 'points',
      label: 'النقاط',
      value: data.totalPoints.toString(),
    });
    
    pass.secondaryFields.push({
      key: 'level',
      label: 'الدرجة',
      value: this.translateLevel(data.rankLevel),
    });
    
    pass.auxiliaryFields.push({
      key: 'member_since',
      label: 'عضو منذ',
      value: data.memberSince.toLocaleDateString('ar-SA-u-ca-gregory'),
    });
    
    pass.backFields.push(
      {
        key: 'description',
        label: 'عن البطاقة',
        value: 'بطاقة عضوية في برنامج الولاء لمنصة سبق الذكية',
      },
      {
        key: 'benefits',
        label: 'المزايا',
        value: 'احصل على نقاط عند قراءة المقالات والتفاعل مع المحتوى. استبدل نقاطك بمكافآت حصرية.',
      },
      {
        key: 'website',
        label: 'الموقع الإلكتروني',
        value: 'https://sabq.org',
      }
    );
  }
  
  private translateLevel(level: number): string {
    const levelMap: Record<number, string> = {
      1: 'برونزي',
      2: 'فضي',
      3: 'ذهبي',
      4: 'بلاتيني',
    };
    return levelMap[level] || 'برونزي';
  }
}
