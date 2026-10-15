import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { NewsletterConfirmation } from "@/components/NewsletterConfirmation";

export const metadata: Metadata = {
  title: "سبق في ٣ دقائق",
  description: "خمس قصص مهمة من سبق في بريدك، يوميًا أو أسبوعيًا.",
  alternates: { canonical: "https://sabq.org/newsletter" },
  robots: process.env.STAGING_NO_INDEX === "true" ? { index: false, follow: false } : { index: true, follow: true },
};

const SAMPLE_STORIES = [
  "عنوان رئيسي يشرح ما حدث بوضوح",
  "خلفية سريعة تساعدك على فهم السياق",
  "رقم أو معلومة موثقة عند توفرها",
  "ما الذي يهم القارئ في هذا التطور؟",
  "الرابط إلى القصة الكاملة على سبق",
];

export default function NewsletterPage() {
  return <><SiteHeader /><main id="main-content" dir="rtl" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8"><NewsletterConfirmation /><div className="grid items-center gap-10 lg:grid-cols-[1.1fr_.9fr]"><section><p className="text-sm font-semibold text-primary">نشرة بريدية من سبق</p><h1 className="mt-3 text-4xl font-bold leading-tight md:text-6xl">سبق في ٣ دقائق</h1><p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">خمس قصص مهمة تساعدك على فهم يومك، تصل إلى بريدك بالطريقة التي تناسبك.</p></section><NewsletterSignup source="newsletter-page" /></div><section className="mx-auto mt-16 max-w-3xl border-t pt-10"><h2 className="text-2xl font-bold">شكل الرسالة</h2><p className="mt-2 text-sm text-muted-foreground">قالب توضيحي؛ العناوين أدناه أمثلة على البنية وليست أخبارًا منشورة.</p><ol className="mt-5 grid gap-3">{SAMPLE_STORIES.map((story, index) => <li key={story} className="rounded-xl border bg-card p-4"><span className="ml-2 text-sm font-bold text-primary">{index + 1}</span>{story}</li>)}</ol></section></main><SiteFooter /></>;
}
