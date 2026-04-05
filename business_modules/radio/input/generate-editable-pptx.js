import PptxGenJS from "pptxgenjs";
import { resolve } from "path";

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";

const SLIDES_DIR = resolve("business_modules/radio/input/slides_extracted");
const W = 13.33, H = 7.5;

function addSlideWithOverlay(slideNum, textBoxes) {
  const slide = pptx.addSlide();
  // Original image as full background
  slide.addImage({
    path: `${SLIDES_DIR}/slide_${String(slideNum).padStart(2, "0")}.png`,
    x: 0, y: 0, w: W, h: H,
  });
  // Overlay editable text boxes
  for (const tb of textBoxes) {
    slide.addText(tb.text, {
      x: tb.x, y: tb.y, w: tb.w, h: tb.h,
      fontSize: tb.fontSize || 14,
      fontFace: tb.font || "Arial",
      bold: tb.bold || false,
      color: tb.color || "FFFFFF",
      align: tb.align || "right",
      valign: tb.valign || "middle",
      rtlMode: true,
      transparency: 100, // fully transparent fill
    });
  }
}

// ==================== SLIDE 1: Title ====================
addSlideWithOverlay(1, [
  { text: "05/04/2026", x: 7.0, y: 0.3, w: 2.5, h: 0.6, fontSize: 16, bold: true, color: "1B2A4A", align: "center" },
  { text: "תוכנית עבודה מבצעית", x: 6.0, y: 1.2, w: 6.5, h: 0.5, fontSize: 18, color: "FFFFFF" },
  { text: "סקר תמונת מצב והתנהגות\nאוכלוסייה: קריית שמונה", x: 2.5, y: 2.0, w: 10.0, h: 1.8, fontSize: 32, bold: true, color: "FFFFFF", align: "center" },
  { text: "מטרת העל: חיזוק תחושת\nמסוגלות וחוסן העיר והתושבים.", x: 3.0, y: 4.6, w: 7.3, h: 1.2, fontSize: 18, bold: true, color: "1B2A4A", align: "center" },
]);

// ==================== SLIDE 2: Foundations ====================
addSlideWithOverlay(2, [
  { text: "הנחות עבודה מרכזיות:\nיסודות החוסן", x: 6.5, y: 0.1, w: 6.5, h: 1.2, fontSize: 24, bold: true, color: "1F4E79" },
  { text: "1. הרשות המקומית\nקריית שמונה- לבנת יסוד", x: 2.0, y: 5.0, w: 5.0, h: 1.1, fontSize: 13, bold: true, color: "FFFFFF", align: "center" },
  { text: '2. פקע"ר (מחוז צפון)-\nימשיך להיות גורם מסייע\nבחיזוק החוסן העירוני.', x: 8.0, y: 3.5, w: 4.5, h: 2.0, fontSize: 12, color: "FFFFFF", align: "center" },
  { text: "3. חוסן התושבים\nוהעיר- חיזוק יכולת\nהתמודדות תחת אש", x: 3.5, y: 1.8, w: 4.5, h: 1.5, fontSize: 12, bold: true, color: "1F4E79", align: "center" },
  { text: "4. התמודדות עם מורכבות\nושחיקה מצטברת לצד עשייה\nעירונית וקהילתית", x: 2.5, y: 3.3, w: 5.0, h: 1.3, fontSize: 11, color: "FFFFFF", align: "center" },
  { text: "5. מסגרת זמן מבצעית:\nתוכנית מעשית בטווח קצר\nשל שלושה שבועות.", x: 0.3, y: 1.6, w: 3.5, h: 2.0, fontSize: 10, bold: true, color: "1B2A4A", align: "center" },
]);

// ==================== SLIDE 3: 8 Efforts Overview ====================
addSlideWithOverlay(3, [
  { text: "תמונת מצב מבצעית:\n8 מאמצים מרכזיים", x: 6.5, y: 0.05, w: 6.5, h: 1.0, fontSize: 22, bold: true, color: "1F4E79" },
  { text: "שליטה ולמידה", x: 0.2, y: 1.05, w: 3.2, h: 0.45, fontSize: 14, bold: true, color: "FFFFFF", align: "center" },
  { text: "קהילה ואנשים", x: 3.5, y: 1.05, w: 3.5, h: 0.45, fontSize: 14, bold: true, color: "FFFFFF", align: "center" },
  { text: "תשתית פיזית", x: 7.1, y: 1.05, w: 3.1, h: 0.45, fontSize: 14, bold: true, color: "FFFFFF", align: "center" },
  { text: "1. מערך מטה החירום הרשותי\nשיפור תהליכי קבלת החלטות\nוניהול מטה החירום.", x: 0.2, y: 1.6, w: 3.2, h: 1.5, fontSize: 11, color: "1F4E79" },
  { text: "2. מערך ההתנדבות ברשות:\nאיגום ותיאום משאבים.", x: 3.5, y: 1.6, w: 3.5, h: 0.9, fontSize: 11, color: "1F4E79" },
  { text: "3. התארגנות תומכת חוסן\nברובעים: פעילי חירום שכונתיים", x: 3.5, y: 2.6, w: 3.5, h: 0.9, fontSize: 11, color: "1F4E79" },
  { text: "4. רשת המקלטים הציבוריים:\nהמקלט כמרחב קהילתי.", x: 7.1, y: 1.6, w: 3.2, h: 1.5, fontSize: 11, color: "1F4E79" },
  { text: "5. מוקד עירוני: מענה פרטני\nלפניות האזרח - עיבוי ומהירות.", x: 3.5, y: 3.6, w: 3.5, h: 0.9, fontSize: 11, color: "1F4E79" },
  { text: "6. מיגון: המשך הצבת מיגוניות -\nמיגון מחזק חוסן", x: 7.1, y: 3.4, w: 3.2, h: 1.1, fontSize: 11, color: "1F4E79" },
  { text: "7. נוכחות בעיניים - מפגש רציף\nבלתי אמצעי עם תושבים.", x: 3.5, y: 4.7, w: 3.5, h: 0.9, fontSize: 11, color: "1F4E79" },
  { text: "8. למידה מהצלחות\nעומק המשאבים של יכולת\nההתמודדות.", x: 0.2, y: 4.7, w: 3.2, h: 1.1, fontSize: 11, color: "1F4E79" },
]);

// ==================== SLIDES 4-11: Table slides helper ====================
function addTableSlideOverlay(slideNum, title, subtitle, rows) {
  const textBoxes = [
    { text: title, x: 0.2, y: 0.05, w: 12.9, h: 0.55, fontSize: 20, bold: true, color: "1F4E79" },
  ];
  if (subtitle) {
    textBoxes.push({ text: subtitle, x: 0.2, y: 0.6, w: 12.9, h: 0.4, fontSize: 13, color: "404040" });
  }
  // Table header
  const cols = ["יעד", "משימה", "זמן", "מנחה", "הישג נדרש"];
  const colX = [0.2, 2.7, 5.9, 7.7, 9.9];
  const colW = [2.4, 3.1, 1.7, 2.1, 3.2];
  const headerY = 1.15;

  cols.forEach((col, i) => {
    textBoxes.push({
      text: col, x: colX[i], y: headerY, w: colW[i], h: 0.45,
      fontSize: 13, bold: true, color: "FFFFFF", align: "center",
    });
  });

  // Data rows
  rows.forEach((row, ri) => {
    const rowY = headerY + 0.5 + ri * 0.95;
    row.forEach((cell, ci) => {
      const cellText = typeof cell === "string" ? cell : cell.text;
      const cellColor = cell.color || "000000";
      textBoxes.push({
        text: cellText, x: colX[ci], y: rowY, w: colW[ci], h: 0.9,
        fontSize: 11, color: cellColor, align: ci === 2 ? "center" : "right",
        bold: ci === 2,
      });
    });
  });

  addSlideWithOverlay(slideNum, textBoxes);
}

// ==================== SLIDE 4: Effort 1 ====================
addTableSlideOverlay(4,
  "מאמץ 1: מערך מטה החירום הרשותי - ארגון ותמיכה צוותית",
  "מטרה: חיזוק מערך מטה החירום הרשותי",
  [
    ["חיזוק מנגנון\nהחלטות", "ליווי ארגוני לראש\nמטה החירום", { text: "מיידי", color: "000000" }, "מכללה לאיתנות", "ניהול מיטבי של ישיבות\nמטה החירום."],
    ["תמיכה בעובדי\nהרשות", "סדנת 'מי יציל את\nהמציל' (עיבוד\nתהליכי עבודה)", { text: "שבוע הבא", color: "FFFFFF" }, "מכללה לאיתנות", "השתתפות 75%\nהעובדים."],
    ["סיוע למנהלי\nמכלולים", "2 מפגשי ייעוץ\nאישיים/קבוצתיים", { text: "שבועיים\nקרובים", color: "FFFFFF" }, "מכללה לאיתנות", "דיווח אישי של\nמנהל/ת המכללה."],
  ]
);

// ==================== SLIDE 5: Effort 2 ====================
addTableSlideOverlay(5,
  "מאמץ 2: מערך ההתנדבות הפועל ברשות - איגום ותיאום משאבים",
  null,
  [
    ["זיהוי מערך\nההתנדבות", "מיפוי כלל הפעילות\nבעיר", { text: "מיידי", color: "000000" }, "גורם עירוני", "מפת גורמים פעילים\nבעיר."],
    ["תיאום בין\nהגורמים", "שולחן עגול, מפגש\nמשותף", { text: "אחת לשבוע", color: "FFFFFF" }, "מכללה לאיתנות", "השתתפות קבועה של\n80%."],
    ["חיזוק דימוי\n(תושבים ורשות)", "כלי תיעוד והכנת\nמנשר שבועי", { text: "שבוע הבא", color: "000000" }, 'גורם עירוני +\nפקע"ר', "הפצת המנשר."],
    ["גיוס מתנדבים\nחדשים", "פרסום קול קורא", { text: "מיידי", color: "000000" }, "גורם עירוני", "הצטרפות 20 תושבים\nלמאגר."],
  ]
);

// ==================== SLIDE 6: Effort 3 ====================
addTableSlideOverlay(6,
  "מאמץ 3: התארגנות 'תומכת חוסן ברובעים' - פעילי חירום שכונתיים",
  'מטרה: עידוד התארגנות עצמית של תושבים שנשארו בעיר עפ"י רובעים.',
  [
    ['הקמת צח"ש', "קול קורא למיפוי\nתושבים", { text: "השבוע", color: "000000" }, "עבודה קהילתית\nעירונית", "2 נציגים מכל\nרחוב/בניין."],
    ["הפיכת מועמדים\nלפעילים", "שיחה אישית\nועידוד", { text: "השבוע", color: "000000" }, "עבודה קהילתית\nעירונית", "60% הצטרפות\nמכלל המועמדים."],
    ["בניית מנגנון\nפעולה", "מפגש פעילים\nמקומי בכל רובע", { text: "שבוע הבא", color: "000000" }, 'חברה אזרחית/\nעירוני/פקע"ר', "רשת קהילתית ב-2\nרובעים לפחות."],
  ]
);

// ==================== SLIDE 7: Effort 4 ====================
addTableSlideOverlay(7,
  "מאמץ 4: רשת המקלטים הציבוריים - 'המקלט כמרחב קהילתי'",
  "מטרה: הפיכת המקלטים הציבוריים למקום התארגנות קהילתית.",
  [
    ["עידוד התארגנות\nבמקלטים", "מיפוי מקלטים\nפעילים", { text: "השבוע", color: "000000" }, "גורם עירוני", "מפת מקלטים\n(מס' תושבים)."],
    ["איתור מובילים", "מיפוי גורם אחראי\nלכל מקלט", { text: "השבוע", color: "000000" }, "גורם עירוני", ""],
    ["הכשרת\nמובילים", "2 מפגשי הנחייה\nלדמויות המובילות", { text: "שבועיים", color: "FFFFFF" }, 'גורם מקצועי/\nאזרחי/פקע"ר', ""],
  ]
);

// ==================== SLIDE 8: Effort 5 ====================
addTableSlideOverlay(8,
  "מאמץ 5: רציפות שירות לאזרח - תגבור מוקד עירוני",
  "מטרה: הרחבת המענה המיטבי לפניות תושבים במוקד העירוני.",
  [
    ["זמינות מענה\nטלפוני", "עיבוי המוקד במתנדבים\nבתחום הפסיכו-סוציאלי", { text: "שבוע", color: "000000" }, "גורם עירוני", "גיוס 10-15 מתנדבים."],
    ["קיצור זמן טיפול\nורישום", 'עיבוי המוקד בפקע"ר,\nקביעת אמות מידה', { text: "מיידי", color: "FFFFFF" }, 'גורם עירוני +\nפקע"ר', "רישום, תיעוד, וזמן\nמענה קצוב."],
    ["מוקד סיוע רגשי\nמרחוק", "הכשרה לפעילים\nיד שרה", { text: "שבועיים", color: "FFFFFF" }, "חברה אזרחית -\nהעברת 2 מפגשי\nהכשרה", ""],
  ]
);

// ==================== SLIDE 9: Effort 6 ====================
addTableSlideOverlay(9,
  'מאמץ 6: מיגון - הצבת מיגוניות - "מיגון מחזק חוסן"',
  'מטרה: המשך עיבוי מערך הצבת המיגוניות כבסיס להצלת חיים וחיזוק חוסן',
  [
    ["המשך רישות העיר\nמיגוניות", 'סקר מיגוניות בהתאם לנהלי מכלול\nמיגון פקע"ר', { text: "תלוי נהלים", color: "FFFFFF" }, "", "מפת רשת המיגוניות והפצתה לאזרח."],
    ["יישום", "הליך אישור והצבת מיגוניות", { text: "", color: "000000" }, "", "פריסה בפועל."],
  ]
);

// ==================== SLIDE 10: Effort 7 ====================
addSlideWithOverlay(10, [
  { text: "מאמץ 7: נוכחות בעיניים - מפגש רציף בלתי אמצעי עם תושבים", x: 0.2, y: 0.05, w: 12.9, h: 0.55, fontSize: 20, bold: true, color: "1F4E79" },
  { text: "מטרה: מיפוי רציף של הבנת התנהגות האוכלוסייה בעיר.", x: 0.2, y: 0.6, w: 12.9, h: 0.4, fontSize: 13, color: "404040" },
  // Header row
  { text: "יעד", x: 0.2, y: 1.15, w: 2.4, h: 0.45, fontSize: 13, bold: true, color: "FFFFFF", align: "center" },
  { text: "משימה", x: 2.7, y: 1.15, w: 3.1, h: 0.45, fontSize: 13, bold: true, color: "FFFFFF", align: "center" },
  { text: "זמן", x: 5.9, y: 1.15, w: 1.7, h: 0.45, fontSize: 13, bold: true, color: "FFFFFF", align: "center" },
  { text: "מנחה", x: 7.7, y: 1.15, w: 2.1, h: 0.45, fontSize: 13, bold: true, color: "FFFFFF", align: "center" },
  { text: "הישג נדרש", x: 9.9, y: 1.15, w: 3.2, h: 0.45, fontSize: 13, bold: true, color: "FFFFFF", align: "center" },
  // Data row
  { text: "ביצוע סקר\nהתנהגות רציף", x: 0.2, y: 1.65, w: 2.4, h: 1.5, fontSize: 11, color: "000000" },
  { text: 'הקמת 3 חוליות\nקבועות (עירייה+ פקע"ר)\nהמסתובבות בעיר\nבתדירות', x: 2.7, y: 1.65, w: 3.1, h: 1.5, fontSize: 11, color: "000000" },
  { text: "שבוע\nהבא", x: 5.9, y: 1.65, w: 1.7, h: 1.5, fontSize: 11, bold: true, color: "000000", align: "center" },
  { text: 'קה"א\nיקל"ר\n+ נציג\nעירוני', x: 7.7, y: 1.65, w: 2.1, h: 1.5, fontSize: 11, color: "000000" },
  { text: "דוחות\nהתנהגות\nמופקים לרשות\nאחת לשבוע.", x: 9.9, y: 1.65, w: 3.2, h: 1.5, fontSize: 11, color: "000000" },
  // Cycle labels
  { text: "מפגש\nבשטח", x: 0.3, y: 3.8, w: 2.5, h: 0.9, fontSize: 12, bold: true, color: "FFFFFF", align: "center" },
  { text: "דוח\nהתנהגות", x: 0.3, y: 4.9, w: 2.5, h: 0.9, fontSize: 12, bold: true, color: "FFFFFF", align: "center" },
  { text: "קבלת\nהחלטות\nבמטה", x: 0.3, y: 6.0, w: 2.5, h: 0.9, fontSize: 12, bold: true, color: "FFFFFF", align: "center" },
]);

// ==================== SLIDE 11: Effort 8 ====================
addTableSlideOverlay(11,
  "מאמץ 8: תיעוד ולמידה מהעשייה בעיר",
  "מטרה: חיזוק הדימוי של התושבים ושל הרשות העירונית ברצף העשייה בחירום.",
  [
    ["תיעוד פעולות העשייה\n(רשות, מתנדבים, פעילים)", "הקמת צוות ייעודי\nללמידה מהצלחות", { text: "שבוע הבא", color: "000000" }, 'גורם עירוני +\nפקע"ר', "הפקת חוברת/מנשר שבועי\n(כתוב ווירטואלי) של העשייה\nבעיר."],
  ]
);

// ==================== SLIDE 12: Dilemmas ====================
addSlideWithOverlay(12, [
  { text: "צומת החלטות: דילמות,\nדילמות, פערים ונושאים להחלטת הנהגה", x: 0.5, y: 0.1, w: 12.3, h: 0.9, fontSize: 22, bold: true, color: "FFC000", align: "center" },
  // Right column: operational dilemmas
  { text: "דילמות תפעוליות", x: 0.3, y: 1.3, w: 6.0, h: 0.5, fontSize: 18, bold: true, color: "FFFFFF", align: "center" },
  { text: "מטה: זהות בעלי התפקידים שיקבלו\nליווי וסיוע מקצועי.", x: 0.5, y: 2.0, w: 5.6, h: 1.0, fontSize: 13, color: "FFFFFF" },
  { text: "סנכרון: מערך עירוני מתכלל ומתאם\nליישום התוכנית המוצעת.", x: 0.5, y: 3.2, w: 5.6, h: 1.0, fontSize: 13, color: "FFFFFF" },
  { text: "בקרה: קביעת תדירות מעקב ובקרה על\nמימוש התוכנית.", x: 0.5, y: 4.4, w: 5.6, h: 1.0, fontSize: 13, color: "FFFFFF" },
  // Left column: shelter gap
  { text: 'מגן לצפון - פער הממ"דים', x: 6.7, y: 1.3, w: 6.3, h: 0.5, fontSize: 18, bold: true, color: "FFFFFF", align: "center" },
  { text: 'הפער הקריטי: משפחות רבות ללא\nממ"דים. קשיים בירוקרטיים קשים\nבקבלת אישור בנייה.', x: 7.0, y: 2.0, w: 5.6, h: 1.0, fontSize: 13, color: "FFFFFF" },
  { text: 'דגש לעבודה: נדרשת הגמשת תקנות\nופישוט תהליכים להתקנת ממ"דים\nבדחיפות.', x: 7.0, y: 3.2, w: 5.6, h: 1.0, fontSize: 13, color: "FFFFFF" },
  { text: "גורמים לפתרון: מערך עירוני +\nמשרדי ממשלה.", x: 7.0, y: 4.4, w: 5.6, h: 1.0, fontSize: 13, color: "FFFFFF" },
]);

// Save
const out = resolve("business_modules/radio/input/Kiryat_Shmona_Resilience_Blueprint_EDITABLE.pptx");
pptx.writeFile({ fileName: out })
  .then(() => console.log(`Done: ${out}`))
  .catch(err => console.error(err));
