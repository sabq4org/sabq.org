import { PassBuilder, PressPassData } from './PassBuilder';
import { PKPass } from 'passkit-generator';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { renderPressCardStrip } from './PressCardImageRenderer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Arabic Wallet fields: right-aligned for RTL legibility on white generic passes. */
const RTL_FIELD = { textAlignment: 'PKTextAlignmentRight' as const };

/** Gregorian yyyy/MM/dd with Western (Latin) numerals — editorial preference. */
function formatValidUntilLatin(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

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
  
  async configurePassFields(pass: PKPass, data: PressPassData): Promise<void> {
    // Render the custom strip image: logo top, photo center, name +
    // role below — the editor's preferred vertical composition. Apple
    // Wallet renders this between the header and primary-field rows.
    // The standard logo (top-left) and thumbnail (top-right) slots are
    // empty 1×1 transparencies in the template so the strip dominates.
    //
    // Server-side fallback: if rendering or font registration fails
    // we just skip the strip injection and fall back to plain fields
    // so the pass still issues.
    try {
      const strips = await renderPressCardStrip({
        userName: data.userName,
        roleAr: this.translateRole(data.userRole),
        profileImageUrl: data.profileImageUrl,
      });
      pass.addBuffer('strip.png', strips.x1);
      pass.addBuffer('strip@2x.png', strips.x2);
      pass.addBuffer('strip@3x.png', strips.x3);
    } catch (e) {
      console.warn('[PressPassBuilder] strip render failed, falling back to fields-only:', e);
    }

    // The strip image carries name + role visually, so we no longer
    // push them as separate fields. The remaining slots host the
    // structured details Apple Wallet users still expect to read.
    if (data.jobTitle) {
      pass.secondaryFields.push({
        key: 'job_title',
        label: 'المنصب',
        value: data.jobTitle,
        ...RTL_FIELD,
      });
    }

    if (data.department) {
      pass.secondaryFields.push({
        key: 'department',
        label: 'القسم',
        value: data.department,
        ...RTL_FIELD,
      });
    }

    if (data.pressIdNumber) {
      pass.auxiliaryFields.push({
        key: 'press_id',
        label: 'رقم البطاقة',
        value: data.pressIdNumber,
        row: 0,
        ...RTL_FIELD,
      });
    }

    if (data.validUntil) {
      pass.auxiliaryFields.push({
        key: 'valid_until',
        label: 'صالحة حتى',
        value: formatValidUntilLatin(data.validUntil),
        row: 0,
        ...RTL_FIELD,
      });
    }

    pass.backFields.push(
      {
        key: 'description',
        label: 'عن البطاقة',
        value: 'بطاقة هوية صحفية رسمية صادرة من منصة سبق الذكية',
        ...RTL_FIELD,
      },
      {
        key: 'website',
        label: 'الموقع الإلكتروني',
        value: 'https://sabq.org',
        ...RTL_FIELD,
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
