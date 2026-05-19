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

  // 2026-05-19 redesign (revision 5): clean white card, Sabq sky-blue
  // labels, navy values. Sabq's official brand color isn't red — it's
  // the azure derived from the web primary HSL(203.89,88.28%,53.14%)
  // (~#1CA4F0). The strip image carries the journalist's name as the
  // dominant visual (rev 4's "name in primaryField + tagline in strip"
  // approach made the name nearly invisible). Secondary metadata
  // (المنصب, الجهة, رقم البطاقة, تاريخ الانتهاء) flows through
  // native Wallet fields so Apple renders them at proper Dynamic
  // Type sizes. The "الدور" field is intentionally omitted per
  // editorial direction — only the public-facing job title appears.
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
    // Strip image carries the SHOWPIECE: Sabq logo (top-right) +
    // the journalist's name (centered, large) + a quiet "بطاقة
    // صحفية رسمية" tagline at the bottom. Best-effort render —
    // if canvas/font registration fails in a fresh container we
    // still ship a valid pass via the secondary fields below.
    try {
      const strips = await renderPressCardStrip({ userName: data.userName });
      pass.addBuffer('strip.png', strips.x1);
      pass.addBuffer('strip@2x.png', strips.x2);
      pass.addBuffer('strip@3x.png', strips.x3);
    } catch (e) {
      console.warn('[PressPassBuilder] strip render failed, continuing with fields only:', e);
    }

    // ── Native Wallet fields ─────────────────────────────────────
    // No headerFields: the org name as a header rendered as white
    // text overlaid on the white strip near the logo, which
    // looked like a smear on the brand mark. Brand attribution
    // lives in the strip's logo + tagline now.
    //
    // No primaryFields: name is baked into the strip at large
    // size. A duplicate primaryField just produces a tiny redundant
    // line under the strip.
    //
    // No "الدور" field: per editor direction, the role
    // (opinion_author / chief_editor / …) shouldn't appear on the
    // public-facing press card. The user's job title is what
    // matters externally.

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
        label: 'الجهة',
        value: data.department,
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

}
