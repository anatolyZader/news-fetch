/**
 * Trilingual municipal PBO follow-up email templates via IMailingDeliveryPort.
 */
const LABELS = {
  en: {
    subject: 'Daily PBO report — information needed',
    intro: 'Your daily municipal PBO report was reviewed. The following details are needed for the 8-component resilience analysis:',
    municipality: 'Municipality',
    date: 'Date',
    openInApp: 'Open in app',
    replyHint: 'You can reply to this email or use the link above to submit answers.',
  },
  he: {
    subject: 'דוח קב"ט יומי — נדרשת השלמת מידע',
    intro: 'דוח קב"ט יומי זה נבדק. נדרשים הפרטים הבאים לניתוח 8 מרכיבי החוסן:',
    municipality: 'רשות',
    date: 'תאריך',
    openInApp: 'פתיחה באפליקציה',
    replyHint: 'ניתן להשיב למייל זה או להשתמש בקישור לעיל.',
  },
  ru: {
    subject: 'Ежедневный отчёт PBO — требуется дополнительная информация',
    intro: 'Ваш ежедневный муниципальный отчёт PBO проверен. Для анализа 8 компонентов устойчивости нужны следующие данные:',
    municipality: 'Муниципалитет',
    date: 'Дата',
    openInApp: 'Открыть в приложении',
    replyHint: 'Можно ответить на это письмо или использовать ссылку выше.',
  },
};

function normalizeLang(lang) {
  const v = String(lang ?? 'he').trim().toLowerCase();
  return LABELS[v] ? v : 'he';
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildAppLink(appBaseUrl, date, municipality) {
  const base = String(appBaseUrl ?? 'https://vibeswitch.ai').replace(/\/$/, '');
  const params = new URLSearchParams({
    section: 'pbo-reports',
    pbo: 'local',
    date,
    muni: municipality,
  });
  return `${base}/?${params.toString()}`;
}

function buildReplyTo(inboundDomain, reviewToken) {
  const domain = String(inboundDomain ?? '').trim();
  if (!domain || !reviewToken) return undefined;
  return `pbo-review+${reviewToken}@${domain}`;
}

/**
 * @param {object} opts
 * @param {import('../../../mailing/domain/ports/IMailingDeliveryPort.js').IMailingDeliveryPort} opts.deliveryPort
 * @param {string} opts.mailFrom
 * @param {string} [opts.appBaseUrl]
 * @param {string} [opts.inboundDomain]
 */
export function createPboReviewMailingAdapter({ deliveryPort, mailFrom, appBaseUrl, inboundDomain }) {
  if (!deliveryPort) throw new Error('deliveryPort is required');
  if (!mailFrom) throw new Error('mailFrom is required');

  return {
    async sendMunicipalFollowUp({ to, language, date, municipality, questions, reviewToken }) {
      const lang = normalizeLang(language);
      const labels = LABELS[lang];
      const dir = lang === 'he' || lang === 'ru' ? 'rtl' : 'ltr';
      const appLink = buildAppLink(appBaseUrl, date, municipality);
      const replyTo = buildReplyTo(inboundDomain, reviewToken);

      const lines = [
        labels.intro,
        '',
        `${labels.municipality}: ${municipality}`,
        `${labels.date}: ${date}`,
        '',
      ];
      questions.forEach((q, i) => {
        const prefix = q.label ? `[${q.label}] ` : '';
        lines.push(`${i + 1}. ${prefix}${q.text}`);
      });
      lines.push('', `${labels.openInApp}: ${appLink}`, '', labels.replyHint);

      const htmlParts = questions.map((q) => {
        const prefix = q.label ? `<strong>${escapeHtml(q.label)}</strong> — ` : '';
        return `<li>${prefix}${escapeHtml(q.text)}</li>`;
      });

      const html = `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><body style="font-family:system-ui,sans-serif;line-height:1.5">
<p>${escapeHtml(labels.intro)}</p>
<p><strong>${escapeHtml(labels.municipality)}:</strong> ${escapeHtml(municipality)}<br/>
<strong>${escapeHtml(labels.date)}:</strong> ${escapeHtml(date)}</p>
<ol>${htmlParts.join('')}</ol>
<p><a href="${escapeHtml(appLink)}">${escapeHtml(labels.openInApp)}</a></p>
<p style="color:#666;font-size:0.9em">${escapeHtml(labels.replyHint)}</p>
</body></html>`;

      const headers = {
        'X-Pbo-Review-Token': reviewToken,
      };

      return deliveryPort.sendTransactional({
        from: mailFrom,
        to: String(to).trim(),
        subject: `${labels.subject} (${municipality}, ${date})`,
        text: lines.join('\n'),
        html,
        headers,
        replyTo,
      });
    },
  };
}
