import { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';
import { EpistemicRoleBadge } from './EpistemicRoleBadge.jsx';
import { MarkdownArticle } from '../ui/index.js';

/**
 * @param {object[]} pool
 * @param {string} refKey
 * @returns {object|null}
 */
function poolItemByRef(pool, refKey) {
  return (pool ?? []).find((p) => p.ref === refKey) ?? null;
}

/**
 * @param {object} props
 */
export function OperatorClaimEvidenceList({
  claims,
  investigationPool,
  formatEvidenceMd,
  t,
}) {
  const list = Array.isArray(claims) ? claims.filter((c) => c?.text) : [];
  const pool = Array.isArray(investigationPool) ? investigationPool : [];
  if (list.length === 0) return null;

  return (
    <Box sx={(theme) => ({ marginTop: theme.spacing(1.5), marginBottom: theme.spacing(1) })}>
      <Typography variant="meta" color="text.secondary" sx={{ display: 'block', marginBottom: 0.75 }}>
        {t('report.claimEvidence.title')}
      </Typography>
      <Stack spacing={1}>
        {list.map((claim, index) => (
          <ClaimBlock
            key={`claim-${index}-${String(claim.text).slice(0, 24)}`}
            claim={claim}
            index={index + 1}
            pool={pool}
            formatEvidenceMd={formatEvidenceMd}
            t={t}
          />
        ))}
      </Stack>
    </Box>
  );
}

function ClaimBlock({ claim, index, pool, formatEvidenceMd, t }) {
  const [open, setOpen] = useState(false);
  const refs = claim.signal_refs ?? claim.evidence_refs ?? [];
  const linked = refs.map((ref) => poolItemByRef(pool, ref)).filter(Boolean);
  const role = claim.operator_epistemic_role
    ?? linked[0]?.operator_epistemic_role
    ?? null;

  return (
    <Box
      sx={(theme) => ({
        padding: theme.spacing(1),
        border: theme.custom.border.hairline,
        borderRadius: `${theme.custom.radius.section}px`,
      })}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap">
        <Typography variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }}>
          {index}.
        </Typography>
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
          {claim.text}
        </Typography>
        <EpistemicRoleBadge role={role} t={t} />
      </Stack>
      {linked.length > 0 && (
        <>
          <Typography
            component="button"
            type="button"
            variant="caption"
            onClick={() => setOpen((v) => !v)}
            sx={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'primary.main',
              textDecoration: 'underline',
              marginTop: 0.5,
              padding: 0,
            }}
          >
            {open
              ? t('report.claimEvidence.hideLinked')
              : t('report.claimEvidence.showLinked').replace('{n}', String(linked.length))}
          </Typography>
          {open && (
            <Stack spacing={0.75} sx={(theme) => ({ marginTop: theme.spacing(0.75) })}>
              {linked.map((item) => (
                <Box key={item.ref} sx={(theme) => ({ paddingLeft: theme.spacing(1) })}>
                  <EpistemicRoleBadge role={item.operator_epistemic_role} t={t} />
                  <MarkdownArticle
                    variant="report"
                    markdown={formatEvidenceMd(item.evidence ?? '')}
                  />
                </Box>
              ))}
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}

ClaimBlock.propTypes = {
  claim: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  pool: PropTypes.arrayOf(PropTypes.object),
  formatEvidenceMd: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};

OperatorClaimEvidenceList.propTypes = {
  claims: PropTypes.arrayOf(PropTypes.object),
  investigationPool: PropTypes.arrayOf(PropTypes.object),
  formatEvidenceMd: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
