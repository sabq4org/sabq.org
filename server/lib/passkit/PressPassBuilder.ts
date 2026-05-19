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

  // 2026-05-19 redesign (revision 4): clean white card, Sabq sky-blue
  // labels, navy values. Sabq's official brand color isn't red — it's
  // the azure derived from the web primary HSL(203.89,88.28%,53.14%)
  // (~#1CA4F0), which is what users see across the app. The strip
  // image at the top now carries ONLY the Sabq logo + "بطاقة صحفية
  // رسمية" tagline; all user data flows through native Wallet fields
  // below so Apple sizes them at proper Dynamic Type points (not the
  // tiny 6–11pt we were getting when we rendered text into the strip
  // bitmap at fixed pixel sizes).
  protected getBackgroundColor(): string {
    return 'rgb(255, 255, 255)';
  }

  protected getForegroundColor(): string {
    return 'rgb(15, 23, 42)';
  }

  protected getLabelColor(): string {
    return 'rgb(28, 164, 240)';
  }

  async configurePassFields(pass: PKPass, data: PressPassData): Promise<void> {
    // Branded header — pure logo + Arabic title, no user data. The
    // strip render is best-effort: if @napi-rs/canvas can't load
    // (e.g. font registration fails in a fresh container) we still
    // ship a perfectly valid pass, just without the branded header.
    try {
      const strips = await renderPressCardStrip();
      pass.addBuffer('strip.png', strips.x1);
      pass.addBuffer('strip@2x.png', strips.x2);
      pass.addBuffer('strip@3x.png', strips.x3);
    } catch (e) {
      console.warn('[PressPassBuilder] strip render failed, continuing with fields only:', e);
    }

    // ── Native Wallet fields ─────────────────────────────────────
    // Coupon-style layout sequence under the strip image:
    //   headerFields  → tiny, top-right corner (org name)
    //   primaryFields → largest line (user name)
    //   secondaryFields → row of medium labels (role + position)
    //   auxiliaryFields → row of small labels (press ID + expiry)
    // Each gets RTL alignment so Arabic reads correctly.

    pass.headerFields.push({
      key: 'org',
      label: 'الجهة',
      value: data.department || 'صحيفة سبق الإلكترونية',
      ...RTL_FIELD,
    });

    pass.primaryFields.push({
      key: 'name',
      label: 'الاسم',
      value: data.userName,
      ...RTL_FIELD,
    });

    pass.secondaryFields.push({
      key: 'role',
      label: 'الدور',
      value: this.translateRole(data.userRole),
      ...RTL_FIELD,
    });
    if (data.jobTitle) {
      pass.secondaryFields.push({
        key: 'job_title',
        label: 'المنصب',
        value: data.jobTitle,
        ...RTL_FIELD,
      });
    }

    if (data.pressIdNumber) {
      pass.auxiliaryFields.push({
        key: 'press_id',
        label: 'رقم البطاقة',
        value: data.pressIdNumber,
        ...RTL_FIELD,
      });
    }
    if (data.validUntil) {
      pass.auxiliaryFields.push({
        key: 'valid_until',
        label: 'تاريخ الانتهاء',
        value: formatValidUntilLatin(data.validUntil),
        ...RTL_FIELD,
      });
    }

    // Back-of-card details (visible after tapping the (i) on the pass).
    pass.backFields.push(
      {
        key: 'description',
        label: 'عن البطاقة',
        value: 'بطاقة هوية صحفية رسمية صادرة من صحيفة سبق الإلكترونية',
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
