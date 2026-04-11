/**
 * Builds Hebrew reply messages for WhatsApp field workers.
 * Replies are practical field questions — no resilience terminology exposed.
 */

const MISSING_QUESTIONS = {
  location: 'באיזה יישוב או אזור?',
  named_person: 'מי דיווח על כך או מי מעורב?',
  scope: 'זה מקרה בודד או שזה קורה במקומות נוספים?',
  specific_details: 'מה בדיוק קרה? פרטים נוספים יעזרו.',
};

/**
 * Build a Hebrew reply based on analysis results.
 * When evidence is sufficient: short acknowledgement.
 * When incomplete: ask concrete follow-up questions to fill gaps.
 * @param {{ signals: object[], assessment: { sufficient: boolean, missing: string[] } }} analysis
 * @returns {string}
 */
export function buildAnalysisReply({ signals, assessment }) {
  // Sufficient evidence — simple confirmation
  if (assessment.sufficient && signals.length > 0) {
    return 'התקבל, תודה.';
  }

  // Some evidence extracted but incomplete — ask for what's missing
  if (signals.length > 0 && assessment.missing.length > 0) {
    const questions = assessment.missing
      .slice(0, 2)
      .map((key) => MISSING_QUESTIONS[key])
      .filter(Boolean);
    return `התקבל. ${questions.join(' ')}`;
  }

  // No evidence at all — ask for basic details
  if (assessment.missing.length > 0) {
    const questions = assessment.missing
      .slice(0, 2)
      .map((key) => MISSING_QUESTIONS[key])
      .filter(Boolean);
    return `תודה. ${questions.join(' ')}`;
  }

  return 'תודה. מה בדיוק קרה? איפה, מי מעורב, ומה ההיקף?';
}
