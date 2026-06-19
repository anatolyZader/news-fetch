/**
 * Report text is localized server-side via GET /api/report/today?lang=.
 * This hook keeps the same API for MainApp while avoiding a second translate fetch.
 */
export function useTranslatedReport(report, _lang) {
  return {
    displayReport: report,
    translating: false,
    translateError: null,
  };
}
