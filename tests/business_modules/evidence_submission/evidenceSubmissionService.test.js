import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceSubmissionService } from '../../../business_modules/evidence_submission/app/evidenceSubmissionService.js';

function recordingDraftStore() {
  return {
    ingestStatuses: [],
    analysisResults: [],
    extractedContents: [],
    setSubmissionIngestStatus(entry) { this.ingestStatuses.push(entry); },
    setSubmissionAnalysisResult(entry) { this.analysisResults.push(entry); },
    setSubmissionExtractedContent(entry) { this.extractedContents.push(entry); },
  };
}

function buildService({ urlReputation, ingestedUrls }) {
  const draftStore = recordingDraftStore();
  const service = createEvidenceSubmissionService({
    evidenceDraftStore: draftStore,
    evidenceStore: null,
    sourceArchive: { upsert: (item) => item.source_id },
    getAudioEvidenceIngestService: () => ({
      ingestAudioUrlToEvidenceItems: async ({ url, date }) => {
        ingestedUrls.push(url);
        return [{
          date,
          source_type: 'audio',
          source_label: 'audio-url',
          source_url: url,
          title: `audio from ${url}`,
          body: 'transcript text',
          published_at: date,
        }];
      },
    }),
    youtubeEvidenceIngestService: {},
    videoGrabService: {},
    videoDownloadDir: '/tmp/unused-video-dir',
    evidenceUserUploadsRoot: '/tmp/unused-uploads-root',
    // keep the job-timeout timer short — the default 20-minute timer is never
    // cleared and would hold the test process open
    jobTimeoutMs: 1000,
    urlReputation,
  });
  return { service, draftStore };
}

async function waitFor(condition, timeoutMs = 3000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('evidenceSubmissionService URL reputation gate', () => {
  it('skips a flagged URL, records the reason, and ingests the clean URL', async () => {
    const ingestedUrls = [];
    const { service, draftStore } = buildService({
      ingestedUrls,
      urlReputation: {
        enabled: true,
        checkUrls: async (urls) => new Map(urls.map((url) => [
          url,
          url.includes('bad')
            ? { status: 'flagged', threatType: 'MALWARE' }
            : { status: 'ok' },
        ])),
      },
    });

    service.enqueue({
      submissionId: 'sub-1',
      ownerKey: 'owner-1',
      content: 'listen to https://cdn.example/bad.mp3 and https://cdn.example/good.mp3',
    });
    await waitFor(() => draftStore.analysisResults.length > 0);

    assert.deepEqual(ingestedUrls, ['https://cdn.example/good.mp3']);
    const ingestStatus = draftStore.ingestStatuses.at(-1);
    assert.equal(ingestStatus.status, 'processed');
    assert.match(ingestStatus.details, /https:\/\/cdn\.example\/bad\.mp3: blocked by Safe Browsing \(MALWARE\)/);
  });

  it('proceeds normally when the checker is disabled (all unchecked)', async () => {
    const ingestedUrls = [];
    const { service, draftStore } = buildService({
      ingestedUrls,
      urlReputation: {
        enabled: false,
        checkUrls: async (urls) => new Map(urls.map((url) => [url, { status: 'unchecked' }])),
      },
    });

    service.enqueue({
      submissionId: 'sub-2',
      ownerKey: 'owner-1',
      content: 'https://cdn.example/one.mp3 https://cdn.example/two.mp3',
    });
    await waitFor(() => draftStore.analysisResults.length > 0);

    assert.deepEqual(ingestedUrls, ['https://cdn.example/one.mp3', 'https://cdn.example/two.mp3']);
    const ingestStatus = draftStore.ingestStatuses.at(-1);
    assert.equal(ingestStatus.status, 'processed');
    assert.equal(ingestStatus.details, 'inserted=2');
  });
});
