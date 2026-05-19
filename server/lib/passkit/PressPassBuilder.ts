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
      const strips = await renderPressCardStrip({
        userName: data.userName,
        jobTitle: data.jobTitle,
        department: data.department,
        pressIdNumber: data.pressIdNumber,
        validUntil: data.validUntil,
      });
      pass.addBuffer('strip.png', strips.x1);
      pass.addBuffer('strip@2x.png', strips.x2);
      pass.addBuffer('strip@3x.png', strips.x3);
    } catch (e) {
      console.warn('[PressPassBuilder] strip render failed, continuing with fields only:', e);
    }

    // ── Native Wallet fields ─────────────────────────────────────
    // Everything that's visible on the front of the card is baked
    // into the strip image — that's the only way to control
    // typography (Apple Wallet's native fields auto-size and can't
    // be shrunk via pass.json). The strip carries:
    //   1. Sabq logo + "بطاقة صحفية رسمية" tagline (header)
    //   2. Name + المنصب (centered block)
    //   3. الجهة | رقم البطاقة | تاريخ الانتهاء (small row at bottom)
    //
    // The back of the card (visible after tapping the (i) icon)
    // gets a couple of native fields with the "official info"
    // copy and the website. Apple Wallet renders backFields as
    // a vertical list, which is fine for textual content.

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
