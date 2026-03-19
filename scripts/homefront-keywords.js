/**
 * Keywords (Hebrew) for articles relevant to:
 * - Population behavior in emergency
 * - Home Front Command (פיקוד העורף) analysis
 * - Psychoemotional state of the population
 * - Special / vulnerable populations
 * Used by extract-homefront-articles.js
 */
export const HOMEFRONT_KEYWORDS = [
  // Home Front Command & emergency behavior
  'פיקוד העורף',
  'אזעקות',
  'אזעקה',
  'ממ"ד',
  'מרחב מוגן',
  'פינוי',
  'מפנה',
  'הנחיות העורף',
  'חירום',
  'מחסה',
  'התגוננות',
  'חזרה לבתי ספר',
  'בתי הספר',
  'לימודים',
  'תושבים',
  'אוכלוסייה',
  'התנהגות',
  'הנחיות',
  'אזור עורף',
  'עורף',
  'הכרעה',
  'המליץ',
  'שיגורים',
  'ירי מלבנון',
  'מספר האזעקות',
  'אזורים',
  'להתקלח',
  'לקניות',
  'חשש מאזעקה',
  'תבנית',
  'סדר',
  'מעקב',
  'נתונים',
  'יישוב',
  'בקעה',
  'ערבה',
  'עוטף עזה',
  'למידה מרחוק',
  'הכנות',
  'פתיחת בתי הספר',
  'מד"א',
  'חילוץ',
  'פינוי נפגעים',
  'שאיפת עשן',
  'שריפה',
  'איסור להיכנס',
  'אפיקי נחלים',
  'שיטפונות',
  'מזג אוויר',
  'הפרעות באספקת החשמל',
  // Psychoemotional state
  'מצב נפשי',
  'נפשי',
  'רגשי',
  'חרדה',
  'חרדות',
  'טראומה',
  'פוסט טראומה',
  'פוסט-טראומה',
  'לחץ נפשי',
  'מתח',
  'פחד',
  'פחדים',
  'תמיכה נפשית',
  'תמיכה רגשית',
  'שירותים נפשיים',
  'חוסן נפשי',
  'חוסן',
  'התמודדות',
  'טיפול נפשי',
  'פסיכולוג',
  'עובד סוציאלי',
  'מצוקה נפשית',
  'משבר נפשי',
  'סיוע נפשי',
  'ערוך נפשית',
  'לחץ',
  'דחק',
  'אזעקות מחזירות',
  'שדה הקרב',
  'לא יוצא מהמיטה',
  'PTSD',
  // Vulnerable / special populations
  'אוכלוסיות פגיעות',
  'אוכלוסיות מיוחדות',
  'אוכלוסייה מוחלשת',
  'קשישים',
  'גיל שלישי',
  'קשיש',
  'ילדים',
  'נוער',
  'תינוקות',
  'נשים בהריון',
  'בעלי מוגבלויות',
  'מוגבלות',
  'נכים',
  'עולים',
  'עולים חדשים',
  'אוכלוסייה בסיכון',
  'צרכים מיוחדים',
  'אנשים עם צרכים מיוחדים',
  'דיור מוגן',
  'בית אבות',
  'מעון',
  'פריפריה',
  'קהילה',
];

// ─── Arabic keywords ───────────────────────────────────────────────────────────
export const HOMEFRONT_KEYWORDS_ARA = [
  // Home Front Command & emergency behavior
  'قيادة الجبهة الداخلية', 'الجبهة الداخلية', 'جبهة الداخل',
  'صفارات الإنذار', 'صافرة الإنذار', 'إنذار جوي', 'إنذار',
  'ملجأ', 'غرفة آمنة', 'ملاجئ', 'مامد',
  'إخلاء', 'إجلاء', 'مهجرون', 'نازحون',
  'طوارئ', 'حالة طوارئ',
  'صواريخ', 'قذائف', 'قصف',
  'سكان', 'مقيمون', 'مدنيون',
  'مدارس', 'طلاب', 'تعليم',
  'شمال إسرائيل', 'الجليل', 'مستوطنات',
  // Psychoemotional
  'خوف', 'قلق', 'توتر', 'ضغط نفسي',
  'صدمة', 'صدمة نفسية', 'اضطراب ما بعد الصدمة',
  'دعم نفسي', 'صحة نفسية', 'صمود',
  // Vulnerable populations
  'مسنون', 'أطفال', 'ذوو الاحتياجات الخاصة', 'نساء حوامل',
  'مجتمع', 'قرية', 'بلدة',
];

// ─── Russian keywords ──────────────────────────────────────────────────────────
export const HOMEFRONT_KEYWORDS_RUS = [
  // Home Front Command & emergency behavior
  'Командование тылом', 'командование тыла', 'Пикуд а-Орев', 'тыл',
  'сирены', 'сирена', 'воздушная тревога', 'тревога',
  'убежище', 'безопасная комната', 'мамад', 'укрытие',
  'эвакуация', 'эвакуированные', 'переселенцы',
  'чрезвычайная ситуация', 'режим ЧС',
  'ракеты', 'обстрел', 'ракетный обстрел',
  'жители', 'население', 'мирные жители',
  'школы', 'дети', 'учащиеся', 'дистанционное обучение',
  'север Израиля', 'Галилея', 'поселения',
  // Psychoemotional
  'страх', 'тревожность', 'стресс', 'психологическое давление',
  'травма', 'ПТСР', 'посттравматическое', 'психологическая помощь',
  'психолог', 'психическое здоровье', 'устойчивость',
  // Vulnerable populations
  'пожилые', 'дети', 'инвалиды', 'беременные',
  'репатрианты', 'новые репатрианты', 'олим',
  'сообщество', 'община',
];

// ─── English keywords ──────────────────────────────────────────────────────────
export const HOMEFRONT_KEYWORDS_ENG = [
  // Home Front Command & emergency behavior
  'Home Front Command', 'civil defense', 'home front',
  'sirens', 'siren', 'air raid', 'alert', 'alarm',
  'bomb shelter', 'safe room', 'shelter',
  'evacuation', 'evacuees', 'displaced residents',
  'emergency', 'emergency situation',
  'rocket fire', 'rocket attack', 'missiles', 'shelling',
  'residents', 'civilians', 'population',
  'schools', 'students', 'remote learning', 'distance learning',
  'northern Israel', 'Galilee', 'communities',
  // Psychoemotional
  'anxiety', 'fear', 'stress', 'psychological',
  'trauma', 'PTSD', 'post-traumatic',
  'mental health', 'resilience', 'coping',
  'psychologist', 'counseling', 'emotional support',
  // Vulnerable populations
  'elderly', 'children', 'disabled', 'pregnant',
  'immigrants', 'new immigrants', 'special needs',
  'community', 'settlement', 'town',
];

// ─── French keywords ───────────────────────────────────────────────────────────
export const HOMEFRONT_KEYWORDS_FRA = [
  // Home Front Command & emergency behavior
  'commandement du front intérieur', 'défense civile', 'front intérieur',
  'sirènes', 'sirène', 'alerte', 'alerte aérienne',
  'abri', 'salle sécurisée', 'abris',
  'évacuation', 'évacués', 'déplacés',
  'urgence', 'situation d\'urgence',
  'tirs de roquettes', 'roquettes', 'missiles', 'bombardement',
  'résidents', 'civils', 'population',
  'écoles', 'élèves', 'enseignement à distance',
  'nord d\'Israël', 'Galilée', 'communautés',
  // Psychoemotional
  'anxiété', 'peur', 'stress', 'psychologique',
  'traumatisme', 'PTSD', 'post-traumatique',
  'santé mentale', 'résilience', 'faire face',
  'psychologue', 'soutien émotionnel',
  // Vulnerable populations
  'personnes âgées', 'enfants', 'handicapés', 'femmes enceintes',
  'immigrants', 'nouveaux immigrants', 'besoins spéciaux',
  'communauté', 'ville',
];

/**
 * Returns true if text (title + body) contains any homefront-relevant keyword
 * in any supported language (Hebrew, Arabic, Russian, English, French).
 * @param {string} title
 * @param {string} body
 * @returns {boolean}
 */
export function isHomefrontRelevant(title, body) {
  const text = `${title || ''} ${body || ''}`;
  return (
    HOMEFRONT_KEYWORDS.some((kw) => text.includes(kw)) ||
    HOMEFRONT_KEYWORDS_ARA.some((kw) => text.includes(kw)) ||
    HOMEFRONT_KEYWORDS_RUS.some((kw) => text.includes(kw)) ||
    HOMEFRONT_KEYWORDS_ENG.some((kw) => text.includes(kw)) ||
    HOMEFRONT_KEYWORDS_FRA.some((kw) => text.includes(kw))
  );
}
