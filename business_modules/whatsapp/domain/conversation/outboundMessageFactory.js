/**
 * Builds typed outbound message models for the WhatsApp DM chatbot.
 * Only the Meta adapter knows how to serialize these to WhatsApp Cloud API JSON.
 *
 * Types:
 *   { type: 'text', body }
 *   { type: 'buttons', body, buttons: [{id, title}] }
 *   { type: 'list', body, buttonText, sections: [{title, rows: [{id, title, description}]}] }
 */

export function buildWelcomeMenu() {
  return {
    type: 'buttons',
    body: 'שלום! אני בוט הדיווחים. תכתוב בחופשיות מה ראית או שמעת, ואני אעזור להשלים דיווח שדה מובנה.',
    buttons: [
      { id: 'start_report', title: 'דיווח חדש' },
      { id: 'status', title: 'סטטוס' },
      { id: 'help', title: 'עזרה' },
    ],
  };
}

export function buildCollectingPrompt() {
  return {
    type: 'text',
    body: 'כתוב בחופשיות — מה ראית, איפה, מתי, מי מעורב? ככל שיש יותר פרטים, אוכל להשלים דיווח מדויק יותר.',
  };
}

/**
 * Present up to 3 LLM-phrased follow-up questions to the officer.
 * Keeps the UX as a single text block to respect WhatsApp DM conventions.
 *
 * @param {string[]} questions  Already filtered / de-duped by caller.
 * @param {string} [preface]    Hebrew preface (e.g. "תודה.").
 */
export function buildFollowupQuestions(questions, preface = 'תודה.') {
  const qs = questions.slice(0, 3);
  if (qs.length === 0) {
    return {
      type: 'text',
      body: `${preface} ספר עוד — מיקום, מקור המידע (ישיר / צוות / תושבים), והאם זו תופעה בודדת או רחבה.`,
    };
  }
  const numbered = qs.map((q, i) => `${i + 1}. ${q}`).join('\n');
  return {
    type: 'text',
    body: `${preface} כדי להשלים את הדיווח אני צריך עוד כמה פרטים:\n${numbered}`,
  };
}

/**
 * Present the Hebrew prose draft for approval.
 * @param {string} draftText  The prose produced by the draft generator.
 */
export function buildDraftPreview(draftText) {
  const body =
    `טיוטת הדיווח:\n\n${(draftText ?? '').trim()}\n\nלאשר ולשלוח, לערוך, או להוסיף דוגמה?`;
  return {
    type: 'buttons',
    body,
    buttons: [
      { id: 'confirm_yes', title: 'אישור ושליחה' },
      { id: 'confirm_edit', title: 'לערוך' },
      { id: 'confirm_add_example', title: 'להוסיף דוגמה' },
    ],
  };
}

export function buildEditPrompt() {
  return {
    type: 'text',
    body: 'מה לשנות? כתוב את התיקון או הפרט הנוסף בחופשיות, ואבנה טיוטה מעודכנת.',
  };
}

export function buildAddExamplePrompt() {
  return {
    type: 'text',
    body: 'הוסף דוגמה קונקרטית — ציטוט של תושב, מקרה ספציפי, או מספר שתיעדת.',
  };
}

export function buildSubmitSuccess() {
  return {
    type: 'text',
    body: 'הדיווח נשלח בהצלחה. תודה!\nהדיווח יעבור ניתוח ויכנס למערכת.',
  };
}

export function buildCancelConfirm() {
  return {
    type: 'text',
    body: 'הדיווח בוטל. שלח הודעה בכל עת להתחיל מחדש.',
  };
}

/**
 * Brief status readout mid-conversation.
 * @param {object|null} draft  Hydrated draft {structured_state, turn_history, approved_draft, ...}
 * @param {string} state       Current conversation state.
 */
export function buildStatusMessage(draft, state) {
  if (!draft) {
    return {
      type: 'text',
      body: 'אין דיווח פתוח כרגע. שלח הודעה כלשהי להתחיל.',
    };
  }
  const STATE_LABELS = {
    collecting: 'איסוף פרטים',
    drafting: 'הכנת טיוטה',
    confirming: 'ממתין לאישור',
  };
  const obs = draft.structured_state?.observation ?? {};
  const linkCount = Array.isArray(draft.structured_state?.componentLinks)
    ? draft.structured_state.componentLinks.length : 0;
  const turnCount = Array.isArray(draft.turn_history) ? draft.turn_history.length : 0;
  const stateLabel = STATE_LABELS[state] ?? state;

  const lines = [
    `דיווח פתוח (שלב: ${stateLabel}):`,
    `מיקום: ${obs.locality ?? '---'}`,
    `התנהגות: ${obs.behavior ?? '---'}`,
    `היקף: ${obs.spread ?? '---'}`,
    `מקור המידע: ${obs.sourceBasis ?? '---'}`,
    `רכיבים מזוהים: ${linkCount}`,
    `סבבי שיחה: ${turnCount}`,
  ];
  return { type: 'text', body: lines.join('\n') };
}

export function buildHelpMessage() {
  return {
    type: 'text',
    body:
      `פקודות זמינות:\n\n` +
      `• שלח הודעה כלשהי — להתחיל דיווח\n` +
      `• *עזרה* או *תפריט* — להציג תפריט\n` +
      `• *סטטוס* — מצב הדיווח הנוכחי\n` +
      `• *איפוס* — למחוק דיווח ולפתוח מחדש\n` +
      `• *ביטול* — לבטל את הדיווח הנוכחי`,
  };
}

export function buildUnknownInput() {
  return {
    type: 'text',
    body: 'לא הבנתי. שלח *עזרה* לרשימת הפקודות או כתוב בחופשיות.',
  };
}

export function buildExpiredSession() {
  return {
    type: 'text',
    body: 'השיחה פגה. שלח הודעה כדי להתחיל מחדש.',
  };
}

export function buildMediaWithoutCaption() {
  return {
    type: 'text',
    body: 'קיבלתי את הקובץ. נא להוסיף טקסט עם תיאור.',
  };
}
