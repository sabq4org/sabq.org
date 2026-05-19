import { PassBuilder, PressPassData } from './PassBuilder';
import { PKPass } from 'passkit-generator';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { renderPressCardStrip } from './PressCardImageRenderer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Arabic Wallet fields: right-aligned for RTL legibility on white generic passes. */
const RTL_FIELD = { textAlignment: 'PKTextAlignmentRight' as const };

/**
 * Render the Sabq brand mark at the three densities Apple Wallet
 * requires for the `logo.png` slot.
 *
 * The logo slot is what shows in the TOP-LEFT of every pass — and
 * crucially, it's the only piece of the card that's visible in
 * Apple Wallet's stack view (when the user scrolls passes from
 * the home screen). Without it, the card reads as "a white
 * rectangle" in the stack, which the editor flagged on rev 11.
 *
 * Apple's hard limits for logo.png:
 *   1x: max 160 × 50 pt
 *   2x: max 320 × 100 pt
 *   3x: max 480 × 150 pt
 *
 * The source brand mark in public/branding/sabq-logo.png is
 * roughly square (751 × 661). At height = 50 the rendered width
 * would be ~57 — fine; the brand mark stays distinctive at that
 * size thanks to the bold blue "س" shapes.
 */
async function buildSabqLogoBuffers(): Promise<{ x1: Buffer; x2: Buffer; x3: Buffer } | null> {
  const src = path.resolve(process.cwd(), 'public/branding/sabq-logo.png');
  if (!fs.existsSync(src)) {
    console.warn('[PressPassBuilder] logo source missing at', src);
    return null;
  }
  try {
    const [x1, x2, x3] = await Promise.all([
      sharp(src).resize({ height: 50, withoutEnlargement: true }).png().toBuffer(),
      sharp(src).resize({ height: 100, withoutEnlargement: true }).png().toBuffer(),
      sharp(src).resize({ height: 150, withoutEnlargement: true }).png().toBuffer(),
    ]);
    return { x1, x2, x3 };
  } catch (e) {
    console.warn('[PressPassBuilder] sharp resize failed:', e);
    return null;
  }
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
    // Inject the Sabq brand mark into the header logo slot. The
    // template ships 1×1 placeholders for logo.png/logo@2x.png so
    // every issued pass needs to override them with the real
    // brand mark. This is what makes the card identifiable in
    // Apple Wallet's stack view (editor: "أشوف بطاقة بيضاء بين
    // البطاقات الأخرى لأن اللوقو لا يظهر").
    try {
      const logos = await buildSabqLogoBuffers();
      if (logos) {
        pass.addBuffer('logo.png', logos.x1);
        pass.addBuffer('logo@2x.png', logos.x2);
        pass.addBuffer('logo@3x.png', logos.x3);
      }
    } catch (e) {
      console.warn('[PressPassBuilder] logo injection failed, continuing without:', e);
    }

    // Strip image carries the visible CARD CONTENT — name +
    // المنصب + الجهة | رقم البطاقة | تاريخ الانتهاء. Best-effort:
    // if canvas/font registration fails in a fresh container we
    // still ship a valid pass via the back fields below.
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
