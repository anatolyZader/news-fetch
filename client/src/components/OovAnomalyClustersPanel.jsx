import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';
import { StatusTag } from '../ui/index.js';

function formatTemplate(template, params = {}) {
  if (!template) return '';
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, value == null ? '—' : String(value)),
    template,
  );
}

function levelToSeverity(level) {
  if (level === 'critical') return 'error';
  if (level === 'warning') return 'warning';
  return 'info';
}

function levelToTagVariant(level) {
  if (level === 'critical') return 'critical';
  if (level === 'warning') return 'alert';
  return 'neutral';
}

function shouldShowPanel(oovBurst, isAnalyst) {
  if (!oovBurst || typeof oovBurst !== 'object') return false;
  if (oovBurst.alert === true) return true;
  return isAnalyst && (oovBurst.total ?? 0) > 0 && Array.isArray(oovBurst.top_clusters) && oovBurst.top_clusters.length > 0;
}

function ClusterCard({ cluster, t }) {
  const keywords = Array.isArray(cluster.keywords) ? cluster.keywords : [];
  const samples = Array.isArray(cluster.sample_evidence) ? cluster.sample_evidence : [];

  return (
    <Box
      sx={(theme) => ({
        padding: theme.spacing(1.25),
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
        background: theme.palette.background.paper,
      })}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ marginBottom: 0.75 }}>
        <StatusTag variant={cluster.high_salience ? 'critical' : 'alert'}>
          {formatTemplate(t('report.oovClusters.count'), { n: cluster.count ?? 0 })}
        </StatusTag>
        {cluster.high_salience && (
          <StatusTag variant="critical">{t('report.oovClusters.highSalience')}</StatusTag>
        )}
        {keywords.map((word) => (
          <StatusTag key={word} variant="neutral">{word}</StatusTag>
        ))}
      </Stack>
      {(cluster.label || cluster.key) && (
        <Typography variant="body2" sx={{ fontWeight: 600, marginBottom: 0.5 }}>
          {cluster.label ?? cluster.key}
        </Typography>
      )}
      {samples.slice(0, 2).map((text, idx) => (
        <Typography
          key={`${cluster.key ?? 'cluster'}-sample-${idx}`}
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', marginTop: idx > 0 ? 0.5 : 0 }}
        >
          {String(text).slice(0, 280)}
        </Typography>
      ))}
    </Box>
  );
}

ClusterCard.propTypes = {
  cluster: PropTypes.shape({
    key: PropTypes.string,
    label: PropTypes.string,
    count: PropTypes.number,
    keywords: PropTypes.arrayOf(PropTypes.string),
    high_salience: PropTypes.bool,
    sample_evidence: PropTypes.arrayOf(PropTypes.string),
  }).isRequired,
  t: PropTypes.func.isRequired,
};

export function OovAnomalyClustersPanel({
  oovBurst,
  oovCaptureCount,
  oovScoringApplied,
  isAnalyst,
  onReviewCatalogProposals,
}) {
  const { t } = useLanguage();

  if (!shouldShowPanel(oovBurst, isAnalyst)) return null;

  const clusters = Array.isArray(oovBurst.top_clusters) ? oovBurst.top_clusters : [];
  const severity = levelToSeverity(oovBurst.level);
  const tagVariant = levelToTagVariant(oovBurst.level);

  return (
    <Alert
      severity={severity}
      variant="outlined"
      sx={(theme) => ({
        alignItems: 'flex-start',
        '& .MuiAlert-message': { width: '100%' },
        borderRadius: `${theme.custom.radius.section}px`,
      })}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="cardTitle" component="div">
            {t('report.oovClusters.title')}
          </Typography>
          {oovBurst.alert === true && (
            <StatusTag variant={tagVariant}>
              {t(`attention.level.${oovBurst.level === 'critical' ? 'critical' : 'warning'}`)}
            </StatusTag>
          )}
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {formatTemplate(t('report.oovClusters.summary'), {
            total: oovBurst.total ?? 0,
            window_hours: oovBurst.window_hours ?? 2,
            method: oovBurst.clustering_method ?? 'prefix',
          })}
        </Typography>

        {oovBurst.top_cluster_key && oovBurst.alert === true && (
          <Typography variant="body2">
            {formatTemplate(t('report.oovClusters.topCluster'), {
              cluster: oovBurst.top_cluster_key,
              cluster_n: oovBurst.top_cluster_count ?? 0,
            })}
          </Typography>
        )}

        {clusters.length > 0 && (
          <Stack spacing={1}>
            {clusters.map((cluster, idx) => (
              <ClusterCard
                key={cluster.key ?? cluster.label ?? `cluster-${idx}`}
                cluster={cluster}
                t={t}
              />
            ))}
          </Stack>
        )}

        <Typography variant="caption" color="text.secondary">
          {t('report.oovClusters.body')}
        </Typography>

        {oovScoringApplied?.synthetic_count > 0 && (
          <Typography variant="caption" color="text.secondary">
            {formatTemplate(t('report.oovClusters.scoringApplied'), {
              weight: oovScoringApplied.weight_discount ?? '—',
            })}
          </Typography>
        )}

        {isAnalyst && typeof onReviewCatalogProposals === 'function' && (
          <Button
            size="small"
            variant="outlined"
            onClick={onReviewCatalogProposals}
          >
            {t('report.oovClusters.reviewCatalogProposals')}
          </Button>
        )}

        {isAnalyst && (oovCaptureCount ?? 0) > 0 && (
          <Typography variant="caption" color="text.secondary">
            {formatTemplate(t('report.oovCapture.count'), { n: oovCaptureCount })}
          </Typography>
        )}
      </Stack>
    </Alert>
  );
}

OovAnomalyClustersPanel.propTypes = {
  oovBurst: PropTypes.shape({
    alert: PropTypes.bool,
    level: PropTypes.string,
    total: PropTypes.number,
    window_hours: PropTypes.number,
    clustering_method: PropTypes.string,
    top_cluster_key: PropTypes.string,
    top_cluster_count: PropTypes.number,
    top_clusters: PropTypes.arrayOf(PropTypes.object),
  }),
  oovScoringApplied: PropTypes.shape({
    synthetic_count: PropTypes.number,
    weight_discount: PropTypes.number,
  }),
  oovCaptureCount: PropTypes.number,
  isAnalyst: PropTypes.bool,
  onReviewCatalogProposals: PropTypes.func,
};
