/**
 * Frozen showcase component for the tour's narrative/evidence steps.
 *
 * Content is a curated excerpt from the real northern report of 2026-05-20
 * (business_modules/resilience_scorer/data/daily_reports/north-1-data-2026-05-20-produced-2026-05-20T1127Z.json),
 * pre-translated per locale so every user sees the same high-quality example
 * regardless of what today's live report contains.
 */

export const TOUR_SHOWCASE_REPORT_DATE = '2026-05-20';

/** Same id in every locale — used to co-highlight the sidebar contents entry. */
export const TOUR_SHOWCASE_COMPONENT_ID = 'functional_continuity';

const EVIDENCE_URLS = {
  compensation: 'https://www.inn.co.il/flashes/1113792',
  kindergartens: 'https://www.inn.co.il/news/697254',
  train: 'https://www.inn.co.il/news/697246',
};

function evidenceItem(markdown) {
  return { markdown, source_type: 'news', article_source: 'inn.co.il' };
}

const EN = {
  component_id: 'functional_continuity',
  narrative_operator: `Functional continuity in northern communities shows a split between institutional mechanisms that have been activated and the day-to-day civilian experience of those mechanisms. On the institutional side, the Finance Committee approved compensation for northern businesses for March–April 2026, with full compensation available to enterprises in front-line settlements ([source](${EVIDENCE_URLS.compensation})), indicating that state support structures are processing claims — though the approval date implies a lag between economic disruption and relief. The preservation of kindergartens in Kiryat Shmona through a legislatively facilitated eligibility extension ([source](${EVIDENCE_URLS.kindergartens})) represents a direct continuity intervention for families in that city. Infrastructure expansion is also documented: a new train station was inaugurated connecting northern Samaria communities to the centre of the country ([source](${EVIDENCE_URLS.train})), though this is a national infrastructure event rather than evidence of northern civilian daily-life resilience under current conditions. What is absent is any resident-level account of whether these mechanisms translate into experienced continuity; the evidence describes the instruments, not their reach.`,
  evidence_operator_structured: [
    evidenceItem(`The Finance Committee approved property tax and compensation fund regulations for March–April 2026 for northern businesses affected by the war ('Operation Roaring Lion'). Full compensation under turnover or payroll tracks will be provided to businesses in front-line settlement communities. ([source](${EVIDENCE_URLS.compensation}))`),
    evidenceItem(`MK Sukkot detailed that an official decision was reached to extend special war-time eligibility to Kiryat Shmona kindergartens, preventing their closure, following his intervention and government ministerial support. ([source](${EVIDENCE_URLS.kindergartens}))`),
    evidenceItem(`The new 'Shomron–Taibeh' train station was inaugurated in a formal ceremony, enabling direct rail connection between northern Samaria communities and central Israel. ([source](${EVIDENCE_URLS.train}))`),
  ],
};

const HE = {
  component_id: 'functional_continuity',
  narrative_operator: `ההמשכיות התפקודית ביישובי הצפון מציגה פער בין המנגנונים המוסדיים שהופעלו לבין החוויה האזרחית היומיומית של אותם מנגנונים. במישור המוסדי, ועדת הכספים אישרה פיצויים לעסקי הצפון עבור מרץ–אפריל 2026, עם פיצוי מלא לעסקים ביישובי קו העימות ([מקור](${EVIDENCE_URLS.compensation})) — עדות לכך שמנגנוני הסיוע הממלכתיים מעבדים תביעות, אם כי מועד האישור מרמז על פער זמן בין הפגיעה הכלכלית לבין הסעד. שימור גני הילדים בקריית שמונה באמצעות הארכת זכאות שהוסדרה בחקיקה ([מקור](${EVIDENCE_URLS.kindergartens})) מהווה התערבות המשכיות ישירה למען משפחות בעיר. מתועדת גם הרחבת תשתיות: נחנכה תחנת רכבת חדשה המחברת את יישובי צפון השומרון למרכז הארץ ([מקור](${EVIDENCE_URLS.train})), אם כי מדובר באירוע תשתית לאומי יותר מאשר עדות לחוסן חיי היומיום האזרחיים בצפון בתנאים הנוכחיים. מה שנעדר הוא דיווח ברמת התושבים על השאלה האם מנגנונים אלה מיתרגמים להמשכיות מוחשית; הראיות מתארות את הכלים, לא את היקף הגעתם.`,
  evidence_operator_structured: [
    evidenceItem(`ועדת הכספים אישרה את תקנות הארנונה וקרן הפיצויים למרץ–אפריל 2026 לעסקי הצפון שנפגעו מהמלחמה ("מבצע שאגת אריה"). פיצוי מלא במסלולי מחזור או שכר יינתן לעסקים ביישובי קו העימות. ([מקור](${EVIDENCE_URLS.compensation}))`),
    evidenceItem(`ח"כ סוקוט פירט כי התקבלה החלטה רשמית להאריך את הזכאות המיוחדת לשעת חירום לגני הילדים בקריית שמונה ולמנוע את סגירתם, בעקבות התערבותו ובתמיכת שרים בממשלה. ([מקור](${EVIDENCE_URLS.kindergartens}))`),
    evidenceItem(`תחנת הרכבת החדשה "שומרון–טייבה" נחנכה בטקס רשמי, ומאפשרת חיבור רכבתי ישיר בין יישובי צפון השומרון למרכז הארץ. ([מקור](${EVIDENCE_URLS.train}))`),
  ],
};

const RU = {
  component_id: 'functional_continuity',
  narrative_operator: `Функциональная непрерывность в северных общинах демонстрирует разрыв между запущенными институциональными механизмами и тем, как их ощущают жители в повседневной жизни. На институциональном уровне финансовая комиссия утвердила компенсации северным предприятиям за март–апрель 2026 года, с полной компенсацией для бизнесов в прифронтовых поселениях ([источник](${EVIDENCE_URLS.compensation})) — признак того, что государственные механизмы поддержки обрабатывают заявки, хотя дата утверждения указывает на задержку между экономическим ущербом и помощью. Сохранение детских садов в Кирьят-Шмоне благодаря законодательно оформленному продлению права на льготы ([источник](${EVIDENCE_URLS.kindergartens})) — прямое вмешательство ради непрерывности для семей города. Задокументировано и расширение инфраструктуры: торжественно открыта новая железнодорожная станция, связывающая общины северной Самарии с центром страны ([источник](${EVIDENCE_URLS.train})), хотя это скорее общенациональное инфраструктурное событие, чем свидетельство устойчивости повседневной гражданской жизни на севере в нынешних условиях. Отсутствуют свидетельства на уровне жителей о том, превращаются ли эти механизмы в ощутимую непрерывность; данные описывают инструменты, а не их охват.`,
  evidence_operator_structured: [
    evidenceItem(`Финансовая комиссия утвердила правила по налогу на недвижимость и компенсационному фонду за март–апрель 2026 года для северных предприятий, пострадавших от войны («операция „Рык льва“»). Полная компенсация по трекам оборота или фонда оплаты труда будет предоставлена бизнесам в прифронтовых поселениях. ([источник](${EVIDENCE_URLS.compensation}))`),
    evidenceItem(`Депутат Кнессета Сукот сообщил, что принято официальное решение продлить особое военное право на льготы для детских садов Кирьят-Шмоны, предотвратив их закрытие, — после его вмешательства и при поддержке министров правительства. ([источник](${EVIDENCE_URLS.kindergartens}))`),
    evidenceItem(`Новая железнодорожная станция «Шомрон–Тайбе» торжественно открыта в ходе официальной церемонии, обеспечивая прямое железнодорожное сообщение между общинами северной Самарии и центром Израиля. ([источник](${EVIDENCE_URLS.train}))`),
  ],
};

export const TOUR_SHOWCASE_COMPONENT = { en: EN, he: HE, ru: RU };
