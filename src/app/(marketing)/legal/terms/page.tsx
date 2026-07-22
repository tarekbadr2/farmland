"use client";

import { LegalDoc, type LegalSection } from "@/components/marketing/legal-doc";
import { LEGAL_CONTACT } from "@/lib/legal";

const sections: LegalSection[] = [
  {
    h: { en: "Acceptance of these terms", ar: "قبول هذه الشروط" },
    p: {
      en: "By creating an account or using Herd OS (the “Service”), you agree to these Terms. If you are using the Service on behalf of a farm or business, you confirm you are authorized to bind it to these Terms.",
      ar: "بإنشاء حساب أو باستخدام Herd OS (\"الخدمة\") فإنك توافق على هذه الشروط. وإذا كنت تستخدم الخدمة نيابةً عن مزرعة أو نشاط تجاري فإنك تؤكّد أنك مخوّل بإلزامه بهذه الشروط.",
    },
  },
  {
    h: { en: "The Service", ar: "الخدمة" },
    p: {
      en: "Herd OS is herd-management software for buffalo dairy and beef farms, offered as a web application and a bundled desktop application. It helps you record and analyze animals, milk, breeding, health, feed, inventory, tasks and finances.",
      ar: "Herd OS هو برنامج لإدارة القطيع لمزارع ألبان ولحوم الجاموس، ويُقدَّم كتطبيق ويب وتطبيق سطح مكتب مُجمّع. يساعدك على تسجيل وتحليل الحيوانات والحليب والتكاثر والصحة والأعلاف والمخزون والمهام والحسابات.",
    },
  },
  {
    h: { en: "Accounts, farms and your team", ar: "الحسابات والمزارع وفريقك" },
    p: {
      en: [
        "You sign in with Google. Each account owner may create one farm and invite team members, assigning each a role (owner, manager, veterinarian, worker, accountant) that limits what they can do.",
        "You are responsible for your team's activity, for keeping access credentials secure, and for the accuracy of the data entered into your farm.",
      ],
      ar: [
        "تسجّل الدخول عبر Google. يمكن لكل مالك حساب إنشاء مزرعة واحدة ودعوة أعضاء الفريق، مع تعيين دور لكلٍّ منهم (مالك، مدير، طبيب بيطري، عامل، محاسب) يحدّد صلاحياته.",
        "أنت مسؤول عن نشاط فريقك، وعن الحفاظ على سرّية بيانات الدخول، وعن دقّة البيانات المُدخلة في مزرعتك.",
      ],
    },
  },
  {
    h: { en: "Free trial, subscriptions and billing", ar: "الفترة التجريبية والاشتراكات والفوترة" },
    p: {
      en: [
        "New farms start with a 7-day free trial. After the trial, continued access requires a paid subscription to one of the plans (Starter, Growth, Enterprise), each with its own herd limit and monthly AI-assistant quota.",
        "Prices are shown in Egyptian pounds (EGP) and are charged through our payment processor, Paymob. When you change plans mid-period, the amount due is prorated against the unused value of your current plan; a downgrade covered by that credit takes effect immediately at no charge.",
        "You may cancel at any time; access continues until the end of the period you have paid for, after which it pauses until you subscribe again. Except where required by law, payments already made for a period are non-refundable.",
      ],
      ar: [
        "تبدأ المزارع الجديدة بفترة تجريبية مجانية مدّتها 7 أيام. وبعد انتهائها يتطلّب استمرار الوصول اشتراكًا مدفوعًا في إحدى الخطط (المبتدئ، النمو، المؤسسات)، ولكلٍّ منها حدّ للقطيع وحصة شهرية للمساعد الذكي.",
        "تُعرض الأسعار بالجنيه المصري (ج.م) وتُحصَّل عبر مزوّد الدفع Paymob. وعند تغيير الخطة أثناء الفترة يُحتسب المبلغ المستحق بالتناسب مع القيمة غير المستخدمة من خطتك الحالية؛ ويسري أي تخفيض يغطّيه هذا الرصيد فورًا وبدون رسوم.",
        "يمكنك الإلغاء في أي وقت؛ ويستمر الوصول حتى نهاية الفترة المدفوعة، ثم يتوقّف حتى تشترك من جديد. وباستثناء ما يقتضيه القانون، فإن المدفوعات عن فترةٍ ما غير قابلة للاسترداد.",
      ],
    },
  },
  {
    h: { en: "The AI advisor is informational only", ar: "المستشار الذكي لأغراض المعلومات فقط" },
    p: {
      en: "The built-in AI advisor answers questions from your farm's own figures to help you think. It is not veterinary, financial, legal or professional advice. Weight, carcass and gain figures are estimates. Always apply your own judgment and consult a qualified professional before acting on anything that affects animal health or money.",
      ar: "يجيب المستشار الذكي المدمج عن الأسئلة اعتمادًا على أرقام مزرعتك لمساعدتك على التفكير. وهو ليس استشارة بيطرية أو مالية أو قانونية أو مهنية. وأرقام الوزن والذبيحة والنمو تقديرية. استخدم دائمًا حُكمك الخاص واستشر مختصًّا مؤهّلًا قبل اتخاذ أي إجراء يؤثّر على صحة الحيوان أو على المال.",
    },
  },
  {
    h: { en: "Acceptable use", ar: "الاستخدام المقبول" },
    p: {
      en: "You agree not to misuse the Service: no unlawful use, no attempts to breach security or access other tenants' data, no reverse engineering, and no reselling the Service without our written permission.",
      ar: "توافق على عدم إساءة استخدام الخدمة: لا استخدام غير قانوني، ولا محاولات لاختراق الأمان أو الوصول إلى بيانات مستأجرين آخرين، ولا هندسة عكسية، ولا إعادة بيع الخدمة دون إذن كتابي منّا.",
    },
  },
  {
    h: { en: "Your data", ar: "بياناتك" },
    p: {
      en: "The farm data you enter belongs to you. We process it only to provide the Service, and each farm's data is isolated from every other farm. Our handling of personal data is described in the Privacy Policy.",
      ar: "بيانات المزرعة التي تُدخلها ملك لك. ونعالجها فقط لتقديم الخدمة، وبيانات كل مزرعة معزولة عن أي مزرعة أخرى. وطريقة تعاملنا مع البيانات الشخصية موضّحة في سياسة الخصوصية.",
    },
  },
  {
    h: { en: "Availability and “as is”", ar: "التوافر و\"كما هي\"" },
    p: {
      en: "We work to keep the Service reliable and available offline, but it is provided “as is” without warranties of any kind. To the fullest extent permitted by law, we are not liable for indirect or consequential losses, and our total liability is limited to the amount you paid for the Service in the 12 months before the claim.",
      ar: "نعمل على إبقاء الخدمة موثوقة ومتاحة دون اتصال، لكنها تُقدَّم \"كما هي\" دون أي ضمانات من أي نوع. وإلى أقصى حدٍّ يسمح به القانون، لا نتحمّل مسؤولية الخسائر غير المباشرة أو التبعية، وتقتصر مسؤوليتنا الإجمالية على المبلغ الذي دفعته مقابل الخدمة خلال الاثني عشر شهرًا السابقة للمطالبة.",
    },
  },
  {
    h: { en: "Termination", ar: "الإنهاء" },
    p: {
      en: "You may stop using the Service and delete your farm at any time. We may suspend or terminate access for a serious or repeated breach of these Terms.",
      ar: "يمكنك التوقّف عن استخدام الخدمة وحذف مزرعتك في أي وقت. ويجوز لنا تعليق أو إنهاء الوصول عند وقوع خرق جسيم أو متكرّر لهذه الشروط.",
    },
  },
  {
    h: { en: "Changes and governing law", ar: "التعديلات والقانون الحاكم" },
    p: {
      en: "We may update these Terms; material changes will be notified in the app. These Terms are governed by the laws of the Arab Republic of Egypt.",
      ar: "قد نُحدّث هذه الشروط؛ وسيتم الإشعار بالتغييرات الجوهرية داخل التطبيق. وتخضع هذه الشروط لقوانين جمهورية مصر العربية.",
    },
  },
  {
    h: { en: "Contact", ar: "التواصل" },
    p: {
      en: `Questions about these Terms: ${LEGAL_CONTACT}.`,
      ar: `لأي أسئلة حول هذه الشروط: ${LEGAL_CONTACT}.`,
    },
  },
];

export default function TermsPage() {
  return (
    <LegalDoc
      title={{ en: "Terms of Service", ar: "شروط الخدمة" }}
      updated={{ en: "Last updated: 22 July 2026", ar: "آخر تحديث: 22 يوليو 2026" }}
      intro={{
        en: "These Terms govern your use of Herd OS. Please read them together with our Privacy Policy.",
        ar: "تحكم هذه الشروط استخدامك لـ Herd OS. يُرجى قراءتها جنبًا إلى جنب مع سياسة الخصوصية.",
      }}
      sections={sections}
    />
  );
}
