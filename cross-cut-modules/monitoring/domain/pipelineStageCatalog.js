/**
 * Static catalog of pipeline artifact stages (filesystem paths relative to repo root).
 * @param {string} date YYYY-MM-DD
 */
export function buildPipelineStageDefinitions(date) {
  return {
    exportStages: [
      {
        id: 'news_export',
        key: 'news',
        label: 'News export',
        kind: 'export',
        relativePath: `business_modules/news-sites/articles_extracted/articles-homefront-${date}.md`,
      },
    ],
    signalStages: [
      { id: 'signals_news', key: 'news', label: 'News signals', kind: 'signals', relativePath: `business_modules/resilience_scorer/data/signals/signals-news-${date}.json` },
      { id: 'signals_radio', key: 'radio', label: 'Radio signals', kind: 'signals', relativePath: `business_modules/resilience_scorer/data/signals/signals-radio-${date}.json` },
      { id: 'signals_whatsapp', key: 'whatsapp', label: 'WhatsApp signals', kind: 'signals', relativePath: `business_modules/resilience_scorer/data/signals/signals-whatsapp-${date}.json` },
      { id: 'signals_pbo', key: 'pbo', label: 'PBO signals', kind: 'signals', relativePath: `business_modules/resilience_scorer/data/signals/signals-pbo-${date}.json` },
      { id: 'signals_pbo_regional', key: 'pbo_regional', label: 'Regional PBO signals', kind: 'signals', relativePath: `business_modules/resilience_scorer/data/signals/signals-pbo_regional-${date}.json` },
      { id: 'signals_naftali', key: 'naftali', label: 'Naftali signals', kind: 'signals', relativePath: `business_modules/resilience_scorer/data/signals/signals-naftali-${date}.json` },
      {
        id: 'signals_visits',
        key: 'visits',
        label: 'Visits signals',
        kind: 'signals',
        relativePath: `business_modules/visits/data/signals/signals-visits-${date}.json`,
      },
      {
        id: 'signals_social',
        key: 'social',
        label: 'Social signals',
        kind: 'signals',
        relativePath: `business_modules/social_media/data/signals-social-${date}.json`,
      },
    ],
  };
}
