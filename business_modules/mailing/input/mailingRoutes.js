/**
 * Fastify routes for mailing preferences and on-demand digest send.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   prefsStore: ReturnType<import('../infrastructure/mailingPreferencesStore.js').createMailingPreferencesStore>,
 *   mailingService: ReturnType<import('../app/mailingService.js').createMailingService>,
 *   tryAuthPreHandler: (req: any, reply: any) => Promise<void>,
 *   isMailingConfigured: () => boolean,
 *   allowAnonymous?: boolean,
 * }} opts
 */
export async function mailingRoutes(app, opts) {
  const {
    prefsStore,
    mailingService,
    tryAuthPreHandler,
    isMailingConfigured,
    allowAnonymous = false,
  } = opts;

  if (!prefsStore || !tryAuthPreHandler || !isMailingConfigured) {
    throw new Error('mailingRoutes: missing required opts');
  }

  async function requireUserOrAllowedAnonymous(request, reply) {
    await tryAuthPreHandler(request, reply);
    if (!request.user) {
      if (allowAnonymous) {
        request.user = { uid: 'anonymous', email: null, anonymous: true };
        return;
      }
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  }

  const pre = { preHandler: requireUserOrAllowedAnonymous };

  app.get('/api/mail/config', async (_request, reply) => {
    return reply.send({ enabled: Boolean(isMailingConfigured?.()) });
  });

  app.get('/api/mail/preferences', pre, async (request, reply) => {
    const uid = request.user.uid;
    const row = prefsStore.getByUid(uid);
    if (!row) {
      return reply.send({
        email: '',
        language: 'en',
        products: { report: true, naftali: true, education: true, platform: false },
      });
    }
    return reply.send({ email: row.email, language: row.language, products: row.products });
  });

  app.put('/api/mail/preferences', pre, async (request, reply) => {
    const uid = request.user.uid;
    const body = request.body ?? {};
    let emailArg;
    if (Object.prototype.hasOwnProperty.call(body, 'email')) {
      const raw = String(body.email ?? '').trim();
      if (raw !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        return reply.code(400).send({ error: 'Invalid email address' });
      }
      emailArg = raw;
    }
    const products = body.products && typeof body.products === 'object' ? body.products : undefined;
    let languageArg;
    if (Object.prototype.hasOwnProperty.call(body, 'language')) {
      const rawLang = String(body.language ?? '').trim().toLowerCase();
      if (!['en', 'he', 'ru'].includes(rawLang)) {
        return reply.code(400).send({ error: 'Invalid digest language' });
      }
      languageArg = rawLang;
    }

    const saved = prefsStore.upsert({
      userUid: uid,
      email: emailArg,
      language: languageArg,
      products,
    });
    return reply.send({ email: saved.email, language: saved.language, products: saved.products });
  });

  app.post('/api/mail/send-digest', pre, async (request, reply) => {
    if (!isMailingConfigured() || !mailingService) {
      return reply.code(503).send({
        error: 'Mailing is not configured (set RESEND_API_KEY and MAIL_FROM)',
      });
    }

    const uid = request.user.uid;
    const jwtEmail = String(request.user.email ?? '').trim().toLowerCase();
    const body = request.body ?? {};
    const bodyTo = body.to != null ? String(body.to).trim().toLowerCase() : '';

    const prefs = prefsStore.getByUid(uid);
    const savedEmail = String(prefs?.email ?? '').trim().toLowerCase();

    let to = '';
    if (bodyTo) {
      if (bodyTo !== jwtEmail && bodyTo !== savedEmail) {
        return reply.code(400).send({
          error: request.user.anonymous
            ? 'Recipient must match the saved mailing address'
            : 'Recipient must match your account email or saved mailing address',
        });
      }
      to = bodyTo;
    } else {
      to = savedEmail || jwtEmail;
    }

    if (!to) {
      return reply.code(400).send({
        error: 'No destination email — set mailing address in settings or sign in with an email account',
      });
    }

    const products = prefs?.products ?? {
      report: true,
      naftali: true,
      education: true,
      platform: false,
    };
    const language = prefs?.language ?? 'en';

    try {
      const result = await mailingService.sendDigest({ to, products, language });
      return reply.send({ ok: true, id: result.id ?? null });
    } catch (err) {
      const status = err?.status >= 400 && err?.status < 600 ? err.status : 502;
      return reply.code(status === 422 ? 502 : status).send({
        error: err?.message ?? 'Send failed',
      });
    }
  });
}
