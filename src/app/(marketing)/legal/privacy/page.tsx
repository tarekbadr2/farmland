"use client";

import { LegalDoc, type LegalSection } from "@/components/marketing/legal-doc";
import { LEGAL_CONTACT, LEGAL_ENTITY } from "@/lib/legal";

const sections: LegalSection[] = [
  {
    h: { en: "Who this applies to", ar: "على من تنطبق" },
    p: {
      en: `This policy explains how ${LEGAL_ENTITY} (“we”) handles personal data when you use Herd OS. It covers the web and desktop applications.`,
      ar: `توضّح هذه السياسة كيف يتعامل ${LEGAL_ENTITY} (\"نحن\") مع البيانات الشخصية عند استخدامك لـ Herd OS. وتغطّي تطبيقي الويب وسطح المكتب.`,
    },
  },
  {
    h: { en: "Data we collect", ar: "البيانات التي نجمعها" },
    p: {
      en: [
        "Account data: your name and email address, provided through Google sign-in.",
        "Farm data you enter: animals, milk records, breeding, health, feed, inventory, tasks, finances and team members. This is operational data about your farm, which may include the contact details of people you add.",
        "AI advisor usage: the questions you ask the assistant and a snapshot of your farm's aggregate figures sent to answer them, plus a monthly count used for your plan quota.",
        "Technical data: basic logs needed to run the Service securely and diagnose problems.",
      ],
      ar: [
        "بيانات الحساب: اسمك وبريدك الإلكتروني، المقدَّمان عبر تسجيل الدخول بـ Google.",
        "بيانات المزرعة التي تُدخلها: الحيوانات وسجلات الحليب والتكاثر والصحة والأعلاف والمخزون والمهام والحسابات وأعضاء الفريق. وهي بيانات تشغيلية عن مزرعتك، وقد تتضمّن بيانات تواصل لأشخاص تضيفهم.",
        "استخدام المستشار الذكي: الأسئلة التي تطرحها على المساعد ولقطة من الأرقام الإجمالية لمزرعتك تُرسَل للإجابة عليها، إضافةً إلى عدّاد شهري يُستخدم لحصة خطتك.",
        "البيانات التقنية: سجلّات أساسية لازمة لتشغيل الخدمة بأمان وتشخيص المشكلات.",
      ],
    },
  },
  {
    h: { en: "How we use it", ar: "كيف نستخدمها" },
    p: {
      en: "We use data to provide and secure the Service, to power the AI advisor on your own figures, to meter usage against your plan, to process payments, and to support you. We do not sell your data or use your farm data to train AI models.",
      ar: "نستخدم البيانات لتقديم الخدمة وتأمينها، ولتشغيل المستشار الذكي اعتمادًا على أرقامك، ولاحتساب الاستخدام مقابل خطتك، ولمعالجة المدفوعات، ولدعمك. ولا نبيع بياناتك ولا نستخدم بيانات مزرعتك لتدريب نماذج الذكاء الاصطناعي.",
    },
  },
  {
    h: { en: "Service providers we share with", ar: "مزوّدو الخدمة الذين نشارك معهم" },
    p: {
      en: [
        "Google Firebase — authentication, database, and hosting of your farm data.",
        "Anthropic — the AI advisor. When you ask a question, your question and a snapshot of your farm's aggregate figures are sent to Anthropic's Claude API to generate an answer.",
        "Paymob — payment processing for subscriptions.",
        "Vercel — hosting of the web application and API.",
        "These providers process data on our behalf under their own security and privacy commitments; we share only what each needs to do its job.",
      ],
      ar: [
        "Google Firebase — المصادقة وقاعدة البيانات واستضافة بيانات مزرعتك.",
        "Anthropic — المستشار الذكي. عند طرحك سؤالًا، يُرسَل سؤالك ولقطة من الأرقام الإجمالية لمزرعتك إلى واجهة Claude من Anthropic لتوليد إجابة.",
        "Paymob — معالجة مدفوعات الاشتراكات.",
        "Vercel — استضافة تطبيق الويب والواجهة البرمجية.",
        "يعالج هؤلاء المزوّدون البيانات نيابةً عنّا وفق التزاماتهم الخاصة بالأمان والخصوصية؛ ولا نشارك إلا ما يحتاجه كلٌّ منهم لأداء عمله.",
      ],
    },
  },
  {
    h: { en: "Payment information", ar: "معلومات الدفع" },
    p: {
      en: "Payments are handled by Paymob. Your card or wallet details are entered on Paymob's secure pages — we never receive or store your full card number.",
      ar: "تتولّى Paymob معالجة المدفوعات. وتُدخَل بيانات بطاقتك أو محفظتك على صفحات Paymob الآمنة — ولا نتلقّى أو نخزّن رقم بطاقتك الكامل مطلقًا.",
    },
  },
  {
    h: { en: "Retention", ar: "الاحتفاظ" },
    p: {
      en: "We keep your farm data for as long as your account is active. When you delete your farm or close your account, we delete or anonymize the associated data within a reasonable period, except where we must retain it to meet legal obligations.",
      ar: "نحتفظ ببيانات مزرعتك طالما ظلّ حسابك نشطًا. وعند حذفك لمزرعتك أو إغلاق حسابك، نحذف البيانات المرتبطة أو نجعلها مجهولة خلال مدّة معقولة، إلا عندما يلزمنا الاحتفاظ بها للوفاء بالتزامات قانونية.",
    },
  },
  {
    h: { en: "Security", ar: "الأمان" },
    p: {
      en: "Data is encrypted in transit and at rest, and access is restricted per farm by security rules so one farm can never read another's data. No system is perfectly secure, but we work to protect your information.",
      ar: "تُشفَّر البيانات أثناء النقل وفي حالة السكون، والوصول مقيّد لكل مزرعة عبر قواعد أمان بحيث لا يمكن لأي مزرعة قراءة بيانات أخرى مطلقًا. ولا يوجد نظام آمن تمامًا، لكننا نعمل على حماية معلوماتك.",
    },
  },
  {
    h: { en: "International transfers", ar: "عمليات النقل الدولية" },
    p: {
      en: "Some providers (such as Google, Anthropic and Vercel) may process data on servers outside Egypt. Where this happens, we rely on those providers' safeguards for such transfers.",
      ar: "قد يعالج بعض المزوّدين (مثل Google وAnthropic وVercel) البيانات على خوادم خارج مصر. وحيثما حدث ذلك، نعتمد على ضمانات هؤلاء المزوّدين بشأن عمليات النقل هذه.",
    },
  },
  {
    h: { en: "Your rights", ar: "حقوقك" },
    p: {
      en: "You can access and correct your data in the app, export a full backup from Settings, and delete your farm data. For any request about your personal data, contact us using the details below.",
      ar: "يمكنك الوصول إلى بياناتك وتصحيحها داخل التطبيق، وتصدير نسخة احتياطية كاملة من الإعدادات، وحذف بيانات مزرعتك. ولأي طلب يخصّ بياناتك الشخصية، تواصل معنا عبر البيانات أدناه.",
    },
  },
  {
    h: { en: "Children", ar: "الأطفال" },
    p: {
      en: "The Service is intended for business use by adults and is not directed at anyone under 18.",
      ar: "الخدمة مُعدّة للاستخدام التجاري من قِبل البالغين وليست موجَّهة لأي شخص دون سن 18.",
    },
  },
  {
    h: { en: "Changes and contact", ar: "التعديلات والتواصل" },
    p: {
      en: `We may update this policy; material changes will be notified in the app. Questions or requests: ${LEGAL_CONTACT}.`,
      ar: `قد نُحدّث هذه السياسة؛ وسيتم الإشعار بالتغييرات الجوهرية داخل التطبيق. للأسئلة أو الطلبات: ${LEGAL_CONTACT}.`,
    },
  },
];

export default function PrivacyPage() {
  return (
    <LegalDoc
      title={{ en: "Privacy Policy", ar: "سياسة الخصوصية" }}
      updated={{ en: "Last updated: 22 July 2026", ar: "آخر تحديث: 22 يوليو 2026" }}
      intro={{
        en: "This policy explains what personal data Herd OS collects, how we use it, and the choices you have.",
        ar: "توضّح هذه السياسة البيانات الشخصية التي يجمعها Herd OS، وكيف نستخدمها، والخيارات المتاحة لك.",
      }}
      sections={sections}
    />
  );
}
