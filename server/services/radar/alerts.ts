/**
 * تنبيهات الرادار — قواعد كلمات مفتاحية تُقيَّم على كل مادة بعد تحليلها:
 * المطابقة ترفع المادة كعاجل (حسب القاعدة) وترسل تنبيه تيليجرام إن كان
 * TELEGRAM_BOT_TOKEN + TELEGRAM_RADAR_CHAT_ID مضبوطين. غياب التهيئة لا يعطل
 * الرادار — تبقى التنبيهات داخل لوحة التحكم فقط.
 */
import type { RadarItem } from "@shared/schema";
import { listRules, updateItem } from "./repo";
import { matchAlertRules, type AlertMatch } from "./parsing";

function telegramConfig(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_RADAR_CHAT_ID;
  return token && chatId ? { token, chatId } : null;
}

export function isTelegramConfigured(): boolean {
  return telegramConfig() !== null;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function sendTelegramAlert(item: RadarItem, matches: AlertMatch[]): Promise<boolean> {
  const config = telegramConfig();
  if (!config) return false;

  const title = item.translatedTitle || item.originalTitle;
  const labels = matches.map((m) => m.rule.label).join("، ");
  const text = [
    `🚨 <b>رادار سبق — رصد عاجل</b>`,
    ``,
    `<b>${escapeHtml(title)}</b>`,
    item.translatedSummary ? escapeHtml(item.translatedSummary) : null,
    ``,
    `📌 القاعدة: ${escapeHtml(labels)}`,
    `📊 القيمة الإخبارية: ${item.newsValue ?? "—"}/100`,
    `🔗 <a href="${escapeHtml(item.link)}">المصدر الأصلي</a> · <a href="https://sabq.org/dashboard/radar">فتح الرادار</a>`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });
  if (!response.ok) {
    console.error(`[Radar Alerts] telegram failed: HTTP ${response.status}`);
    return false;
  }
  return true;
}

/**
 * يقيّم قواعد التنبيه على مواد حُلّلت للتو: يعلّم المطابقات (عاجل + كلمات)
 * ويرسل تيليجرام لمن لم يُنبَّه عنها سابقًا. يعيد عدد التنبيهات المرسلة.
 */
export async function processAlerts(items: RadarItem[]): Promise<number> {
  if (!items.length) return 0;
  const rules = await listRules(true);
  if (!rules.length) return 0;

  let sent = 0;
  for (const item of items) {
    if (item.alertedAt) continue;
    const matches = matchAlertRules(item, rules);
    if (!matches.length) continue;

    const markBreaking = matches.some((m) => m.rule.markBreaking);
    const wantsTelegram = matches.some((m) => m.rule.notifyTelegram);
    const matchedKeywords = [...new Set(matches.flatMap((m) => m.keywords))];

    let delivered = false;
    if (wantsTelegram) {
      try {
        delivered = await sendTelegramAlert(item, matches);
      } catch (error) {
        console.error("[Radar Alerts] telegram send failed:", error);
      }
    }
    await updateItem(item.id, {
      matchedKeywords,
      isBreaking: item.isBreaking || markBreaking,
      alertedAt: new Date(),
    });
    if (delivered) sent++;
  }
  return sent;
}
