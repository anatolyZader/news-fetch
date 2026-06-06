import { resolve } from 'node:path';
import { VideoGrabService } from '../business_modules/video/app/videoGrabService.js';
import { YoutubeTranscriptService } from '../business_modules/video/app/youtubeTranscriptService.js';
import { YoutubeEvidenceIngestService } from '../business_modules/video/app/youtubeEvidenceIngestService.js';
import { createYtDlpYoutubeAdapter } from '../business_modules/video/infrastructure/adapters/ytDlpYoutubeAdapter.js';
import { createYoutubeDataApiCaptionsAdapter } from '../business_modules/video/infrastructure/adapters/youtubeDataApiCaptionsAdapter.js';
import { createLocalVideoFileAdapter } from '../business_modules/video/infrastructure/adapters/localVideoFileAdapter.js';
import { defaultVideoDownloadDir } from '../business_modules/video/infrastructure/videoDataPaths.js';
import { AudioEvidenceIngestService } from '../business_modules/audio/app/audioEvidenceIngestService.js';
import { contextualizeTranscript } from '../business_modules/audio/app/audioTranscriptContextualizer.js';
import { OpenaiTranscriptionAdapter } from '../business_modules/audio/infrastructure/adapters/openaiTranscriptionAdapter.js';
import { createHttpAudioDownloadAdapter } from '../business_modules/audio/infrastructure/adapters/httpAudioDownloadAdapter.js';
import { createReportBuildService } from '../business_modules/report_build/app/reportBuildService.js';
import {
  createAnthropicReportBuildAnalyzerAdapter,
} from '../business_modules/report_build/infrastructure/adapters/anthropicReportBuildAnalyzerAdapter.js';
import {
  createAnthropicReportBuildSuggestAdapter,
} from '../business_modules/report_build/infrastructure/adapters/anthropicReportBuildSuggestAdapter.js';
import {
  createAnthropicReportBuildDraftGeneratorAdapter,
} from '../business_modules/report_build/infrastructure/adapters/anthropicReportBuildDraftGeneratorAdapter.js';
import { createReportBuildConversationStore } from '../business_modules/report_build/infrastructure/reportBuildConversationStore.js';
import { createReportBuildDraftStore } from '../business_modules/report_build/infrastructure/reportBuildDraftStore.js';
import { createWhatsAppMessageStore } from '../business_modules/whatsapp/infrastructure/whatsappMessageStore.js';
import { createWhatsAppSignalStore } from '../business_modules/whatsapp/infrastructure/whatsappSignalStore.js';
import { createWhatsAppConversationStore } from '../business_modules/whatsapp/infrastructure/whatsappConversationStore.js';
import { createWhatsAppReportDraftStore } from '../business_modules/whatsapp/infrastructure/whatsappReportDraftStore.js';
import { createMetaCloudApiAdapter } from '../business_modules/whatsapp/infrastructure/adapters/metaCloudApiAdapter.js';
import { createWhatsAppIngestService } from '../business_modules/whatsapp/app/whatsappIngestService.js';
import { createWhatsAppResilienceAnalyzer } from '../business_modules/whatsapp/app/whatsappResilienceAnalyzer.js';
import {
  buildSignalExtractionSystemPrompt,
  applySourceNativeGrounding,
  createNoOpGeoEnrichmentPort,
  enrichFieldProvenance,
} from '../business_modules/resilience/index.js';
import { createDraftGenerator } from '../business_modules/whatsapp/app/draftGenerator.js';
import { whatsappWebhookPlugin } from '../business_modules/whatsapp/input/webhook-routes.js';
import { createReportBuildService as createReportBuildServiceFromWa } from '../business_modules/report_build/app/reportBuildService.js';

/**
 * @param {{ repoRoot: string, sqlitePath: string, retrievalService: object, evidenceStore: object, sourceArchive: object, geoService: object, geoEnrichmentPort: object }} deps
 */
export function createMediaHelpers(deps) {
  let audioEvidenceIngestService = null;

  function contextualizeTranscriptWithRag(segments, opts = {}) {
    return contextualizeTranscript(segments, {
      ...opts,
      retrievalService: deps.retrievalService,
    });
  }

  function getAudioEvidenceIngestService() {
    if (!audioEvidenceIngestService) {
      audioEvidenceIngestService = new AudioEvidenceIngestService({
        audioDownloadPort: createHttpAudioDownloadAdapter(),
        transcriptionPort: new OpenaiTranscriptionAdapter(),
      });
    }
    return audioEvidenceIngestService;
  }

  function createVideoServices() {
    const videoDownloadDir = process.env.VIDEO_DOWNLOAD_DIR?.trim()
      ? resolve(process.env.VIDEO_DOWNLOAD_DIR)
      : defaultVideoDownloadDir();

    const ytDlpAdapter = createYtDlpYoutubeAdapter();
    const videoGrabService = new VideoGrabService({
      remoteFetchPort: ytDlpAdapter,
      localFilePort: createLocalVideoFileAdapter(),
    });
    const youtubeEvidenceIngestService = new YoutubeEvidenceIngestService({
      transcriptService: new YoutubeTranscriptService({
        remoteFetchPort: ytDlpAdapter,
        dataApiCaptions: createYoutubeDataApiCaptionsAdapter(),
      }),
      videoGrabService,
      audioEvidenceIngestService: {
        ingestAudioFileToEvidenceItems: (...args) =>
          getAudioEvidenceIngestService().ingestAudioFileToEvidenceItems(...args),
      },
      contextualizeTranscript: contextualizeTranscriptWithRag,
    });

    return { videoDownloadDir, videoGrabService, youtubeEvidenceIngestService };
  }

  function createReportBuildServiceIfConfigured() {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;
    return createReportBuildService({
      analyzerPort: createAnthropicReportBuildAnalyzerAdapter({
        anthropicApiKey: process.env.ANTHROPIC_API_KEY.trim(),
        buildSignalExtractionSystemPrompt,
      }),
      suggestAnalyzerPort: createAnthropicReportBuildSuggestAdapter({
        anthropicApiKey: process.env.ANTHROPIC_API_KEY.trim(),
      }),
      draftGeneratorPort: createAnthropicReportBuildDraftGeneratorAdapter({
        anthropicApiKey: process.env.ANTHROPIC_API_KEY.trim(),
      }),
      conversationStore: createReportBuildConversationStore(deps.sqlitePath),
      draftStore: createReportBuildDraftStore(deps.sqlitePath),
      geoLocalityPort: deps.geoService,
      retrievalService: deps.retrievalService,
      sourceArchive: deps.sourceArchive,
    });
  }

  async function registerWhatsappWebhook(app, reportBuildService) {
    if (!process.env.WHATSAPP_VERIFY_TOKEN) return;

    const whatsappMessageStore = createWhatsAppMessageStore(deps.sqlitePath);
    const whatsappSignalStore = createWhatsAppSignalStore(deps.sqlitePath);
    const whatsappConversationStore = createWhatsAppConversationStore(deps.sqlitePath);
    const whatsappDraftStore = createWhatsAppReportDraftStore(deps.sqlitePath);
    const whatsappApiAdapter = createMetaCloudApiAdapter({
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    });
    const whatsappResilienceAnalyzer = process.env.ANTHROPIC_API_KEY?.trim()
      ? createWhatsAppResilienceAnalyzer({
        anthropicApiKey: process.env.ANTHROPIC_API_KEY.trim(),
        geoEnrichmentPort: deps.geoEnrichmentPort,
        buildSignalExtractionSystemPrompt,
        applySourceNativeGrounding,
        createNoOpGeoEnrichmentPort,
        enrichFieldProvenance,
      })
      : null;
    const whatsappDraftGenerator = process.env.ANTHROPIC_API_KEY?.trim()
      ? createDraftGenerator({ anthropicApiKey: process.env.ANTHROPIC_API_KEY.trim() })
      : null;
    const whatsappIngestService = createWhatsAppIngestService({
      messageStore: whatsappMessageStore,
      apiAdapter: whatsappApiAdapter,
      evidenceStore: deps.evidenceStore,
      sourceArchive: deps.sourceArchive,
      signalStore: whatsappSignalStore,
      resilienceAnalyzer: whatsappResilienceAnalyzer,
      draftGenerator: whatsappDraftGenerator,
      reportBuildService: reportBuildService
        ? createReportBuildServiceFromWa({
          analyzerPort: whatsappResilienceAnalyzer,
          draftGeneratorPort: whatsappDraftGenerator,
          conversationStore: whatsappConversationStore,
          draftStore: whatsappDraftStore,
          geoLocalityPort: deps.geoService,
          retrievalService: deps.retrievalService,
          sourceArchive: deps.sourceArchive,
        })
        : null,
      conversationStore: whatsappConversationStore,
      draftStore: whatsappDraftStore,
      allowedGroupIds: (process.env.WHATSAPP_ALLOWED_GROUP_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    });
    await app.register(whatsappWebhookPlugin, {
      ingestService: whatsappIngestService,
      apiAdapter: whatsappApiAdapter,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
      appSecret: process.env.WHATSAPP_APP_SECRET,
    });
  }

  return {
    getAudioEvidenceIngestService,
    createVideoServices,
    createReportBuildServiceIfConfigured,
    registerWhatsappWebhook,
  };
}

export function evidenceOwnerKey(request) {
  return request.user?.uid ?? 'anonymous';
}

export function chatOwnerUid(request) {
  return request.user?.uid ?? 'anonymous';
}
