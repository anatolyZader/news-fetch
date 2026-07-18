/**
 * Source-type → extraction content kind. Single source of truth for the
 * extract and trace CLIs (`field` is the legacy alias of `visits`).
 */
export const CONTENT_KIND = {
  news: 'news',
  radio: 'audio',
  field: 'field_report',
  visits: 'field_report',
  whatsapp: 'whatsapp',
};
