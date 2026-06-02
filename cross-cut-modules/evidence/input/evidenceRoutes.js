/**
 * Evidence submission queue and ingest routes.
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomBytes } from 'node:crypto';
import { classifyEvidenceInput } from '../evidenceInputClassifier.js';
import { createEvidenceSubmissionService } from '../evidenceSubmissionService.js';
import { multipartFieldValue } from './submissionHelpers.js';
import { auditFromRequest } from '../../security/input/auditLog.js';
import { costlyRoutePreHandlers } from '../../security/input/costlyRoutePreHandlers.js';
import { authPreHandlerList } from '../../auth/buildAuthHooks.js';
import {
  canRunEvidenceLlmAnalysis,
  recordEvidenceLlmAnalysis,
} from './evidenceAnalysisAccess.js';
import { normalizeReportScope } from '../../../business_modules/resilience/index.js';

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 */
export async function evidenceRoutes(app, opts) {
  const {
    authHook,
    evidenceDraftStore,
    evidenceStore,
    sourceArchive,
    maxEvidenceDraftChars,
    evidenceUserUploadsRoot,
    videoDownloadDir,
    videoGrabService,
    youtubeEvidenceIngestService,
    getAudioEvidenceIngestService,
    evidenceOwnerKey,
  } = opts;

  const submission = createEvidenceSubmissionService({
    evidenceDraftStore,
    evidenceStore,
    sourceArchive,
    videoDownloadDir,
    videoGrabService,
    youtubeEvidenceIngestService,
    getAudioEvidenceIngestService,
    evidenceUserUploadsRoot,
    outboxStore: opts.outboxStore ?? null,
  });

  app.get('/api/evidence-draft', authHook, async (request, reply) => {
    const row = evidenceDraftStore.get(evidenceOwnerKey(request));
    return reply.send({ content: row.content, updatedAt: row.updatedAt });
  });

  app.put('/api/evidence-draft', authHook, async (request, reply) => {
    const body = request.body ?? {};
    const content = body.content;
    if (typeof content !== 'string') {
      return reply.code(400).send({ error: 'content must be a string' });
    }
    if (content.length > maxEvidenceDraftChars) {
      return reply.code(400).send({
        error: `content too long (max ${maxEvidenceDraftChars} characters)`,
      });
    }
    const row = evidenceDraftStore.save(evidenceOwnerKey(request), content);
    return reply.send({ content: row.content, updatedAt: row.updatedAt });
  });

  app.post('/api/evidence-submit', costlyRoutePreHandlers(authPreHandlerList(authHook)), async (request, reply) => {
    const body = request.body ?? {};
    const content = body.content;
    if (typeof content !== 'string') {
      return reply.code(400).send({ error: 'content must be a string' });
    }
    if (content.length > maxEvidenceDraftChars) {
      return reply.code(400).send({
        error: `content too long (max ${maxEvidenceDraftChars} characters)`,
      });
    }
    if (content.trim().length === 0) {
      return reply.code(400).send({ error: 'content must not be empty' });
    }

    const ownerKey = evidenceOwnerKey(request);
    const classification = classifyEvidenceInput(content);
    const savedDraft = evidenceDraftStore.save(ownerKey, content);
    const submissionRow = evidenceDraftStore.submit(
      ownerKey,
      content,
      classification.category,
      classification.detectedUrl,
    );
    const allowLlmAnalysis = canRunEvidenceLlmAnalysis(request, evidenceDraftStore);
    if (allowLlmAnalysis) {
      recordEvidenceLlmAnalysis(request, evidenceDraftStore);
    }
    submission.enqueue({
      submissionId: submissionRow.id,
      ownerKey,
      content,
      localFilePaths: [],
      allowLlmAnalysis,
      reportScopeId: normalizeReportScope(body.scope ?? body.reportScopeId ?? 'national'),
    });

    auditFromRequest(request, 'evidence.submit', '/api/evidence-submit', {
      submissionId: submissionRow.id,
      allowLlmAnalysis,
    });

    return reply.code(202).send({
      submission: submissionRow,
      draft: { content: savedDraft.content, updatedAt: savedDraft.updatedAt },
      queued: true,
    });
  });

  app.post('/api/evidence-upload', costlyRoutePreHandlers(authPreHandlerList(authHook)), async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.code(400).send({
        error: 'use multipart/form-data with field "content" and optional file fields "files"',
      });
    }
    const ownerKey = evidenceOwnerKey(request);
    let textContent = '';
    const savedPaths = [];
    const batchId = randomBytes(12).toString('hex');
    const batchDir = join(evidenceUserUploadsRoot, ownerKey, batchId);
    await mkdir(batchDir, { recursive: true });

    try {
      for await (const part of request.parts()) {
        if (part.type === 'file' && (part.fieldname === 'files' || part.fieldname === 'file')) {
          const rawName = part.filename || 'upload.bin';
          const safe = basename(rawName).replaceAll(/[^a-zA-Z0-9._-]/g, '_') || 'file';
          const dest = join(batchDir, `${savedPaths.length}-${safe}`);
          await pipeline(part.file, createWriteStream(dest));
          savedPaths.push(dest);
        } else if (part.type === 'field' && part.fieldname === 'content') {
          textContent = multipartFieldValue(part);
        }
      }
    } catch (err) {
      return reply.code(400).send({ error: err?.message || 'upload failed' });
    }

    if (!textContent.trim() && savedPaths.length === 0) {
      return reply.code(400).send({ error: 'Add text/URLs and/or at least one file' });
    }

    const contentForStore =
      textContent.trim() ||
      (savedPaths.length ? `[File upload: ${savedPaths.length} file(s)]` : '');
    if (contentForStore.length > maxEvidenceDraftChars) {
      return reply.code(400).send({ error: `content too long (max ${maxEvidenceDraftChars} characters)` });
    }

    const classification = classifyEvidenceInput(textContent.trim() || 'upload');
    const savedDraft = evidenceDraftStore.save(ownerKey, textContent.trim() || contentForStore);
    const submissionRow = evidenceDraftStore.submit(
      ownerKey,
      contentForStore,
      classification.category,
      classification.detectedUrl,
    );
    const jobText = textContent.trim() || (savedPaths.length ? `[File upload: ${savedPaths.length} file(s)]` : ' ');
    const allowLlmAnalysis = canRunEvidenceLlmAnalysis(request, evidenceDraftStore);
    if (allowLlmAnalysis) {
      recordEvidenceLlmAnalysis(request, evidenceDraftStore);
    }
    submission.enqueue({
      submissionId: submissionRow.id,
      ownerKey,
      content: jobText,
      localFilePaths: savedPaths,
      allowLlmAnalysis,
      reportScopeId: normalizeReportScope(request.query?.scope ?? 'national'),
    });

    auditFromRequest(request, 'evidence.upload', '/api/evidence-upload', {
      submissionId: submissionRow.id,
      fileCount: savedPaths.length,
      allowLlmAnalysis,
    });

    return reply.code(202).send({
      submission: submissionRow,
      draft: { content: savedDraft.content, updatedAt: savedDraft.updatedAt },
      queued: true,
    });
  });

  app.get('/api/evidence-submissions', authHook, async (request, reply) => {
    const ownerKey = evidenceOwnerKey(request);
    const limit = Math.min(Number(request.query?.limit ?? 10), 50);
    const submissions = evidenceDraftStore.getRecentSubmissions({ ownerKey, limit });
    return reply.send({ submissions });
  });

  app.get('/api/evidence-submissions/:id', authHook, async (request, reply) => {
    const submissionId = Number.parseInt(String(request.params?.id ?? ''), 10);
    if (!Number.isFinite(submissionId) || submissionId <= 0) {
      return reply.code(400).send({ error: 'invalid submission id' });
    }
    const ownerKey = evidenceOwnerKey(request);
    const submission = evidenceDraftStore.getSubmissionById({ submissionId, ownerKey });
    if (!submission) {
      return reply.code(404).send({ error: 'submission not found' });
    }
    return reply.send({ submission });
  });

  app.get('/api/evidence-submissions/latest', authHook, async (request, reply) => {
    const ownerKey = evidenceOwnerKey(request);
    const submission = evidenceDraftStore.getLatestSubmission({ ownerKey });
    if (!submission) {
      return reply.send({ found: false });
    }
    return reply.send({ found: true, submission });
  });
}
