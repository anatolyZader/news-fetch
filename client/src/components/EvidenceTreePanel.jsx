import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

import { useLanguage } from '../context/LanguageContext.jsx';

/**
 * Expandable evidence tree per claim (assessment v2).
 */
export function EvidenceTreePanel({ evidenceTree, reasoningTraceId, isAnalyst }) {
  const { t } = useLanguage();
  const tree = Array.isArray(evidenceTree) ? evidenceTree : [];
  if (tree.length === 0) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
        {t('report.evidenceTree.title')}
        {isAnalyst && reasoningTraceId && (
          <Typography component="span" variant="caption" sx={{ ml: 1 }}>
            ({t('report.evidenceTree.trace')}: {reasoningTraceId})
          </Typography>
        )}
      </Typography>
      <Stack spacing={1} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {tree.map((node) => (
          <Box
            component="li"
            key={node.claim_id ?? node.text?.slice(0, 40)}
            sx={(theme) => ({
              border: theme.custom.border.hairline,
              borderRadius: `${theme.custom.radius.chip}px`,
              p: 1,
            })}
          >
            <Typography variant="body2">{node.text}</Typography>
            {(node.support?.length > 0 || node.contradict?.length > 0) && (
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                {node.support?.length > 0 && (
                  <span>
                    {t('report.evidenceTree.support')}: {node.support.map((s) => s.ref).join(', ')}
                  </span>
                )}
                {node.contradict?.length > 0 && (
                  <span>
                    {' · '}
                    {t('report.evidenceTree.contradict')}: {node.contradict.map((s) => s.ref).join(', ')}
                  </span>
                )}
              </Typography>
            )}
            {(node.flags?.length > 0) && (
              <Typography variant="caption" color="warning.main" component="div">
                {node.flags.map((f) => (
                  f === 'unverified' || f === 'oov_cluster'
                    ? t('report.evidenceTree.unverified')
                    : f
                )).join(', ')}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

EvidenceTreePanel.propTypes = {
  evidenceTree: PropTypes.arrayOf(PropTypes.object),
  reasoningTraceId: PropTypes.string,
  isAnalyst: PropTypes.bool,
};
