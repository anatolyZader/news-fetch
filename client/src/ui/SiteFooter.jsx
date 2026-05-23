import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { LanguageSelector } from '../components/LanguageSelector.jsx';
import { getDocsBaseUrl, getSupportEmail, joinDocsPath } from '../lib/docsUrl.js';
import { formatDate } from '../lib/date.js';

const COPYRIGHT = '© 2026 VibesWitch.ai';

const FOOTER_ROOT_SX = (theme) => ({
  width: '100%',
  marginTop: 'auto',
  background: theme.palette.background.default,
  borderTop: theme.custom.border.hairline,
});

const FOOTER_META_SX = (theme) => ({
  borderTop: theme.custom.border.hairline,
  background: alpha(theme.palette.divider, 0.55),
});

const FOOTER_SHELL_SX = (theme) => ({
  maxWidth: 1280,
  marginLeft: 'auto',
  marginRight: 'auto',
  paddingLeft: theme.spacing(3),
  paddingRight: theme.spacing(3),
  [theme.breakpoints.down('sm')]: {
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
  },
});

const linkSx = (theme) => ({
  display: 'inline-block',
  fontSize: theme.typography.body2.fontSize,
  lineHeight: 1.6,
  color: 'text.secondary',
  cursor: 'pointer',
  textDecoration: 'none',
  '&:hover': { color: 'text.primary' },
});

const metaLinkSx = (theme) => ({
  ...linkSx(theme),
  fontSize: theme.typography.caption.fontSize,
  border: 'none',
  background: 'none',
  padding: 0,
  font: 'inherit',
});

function FooterLink({ children, onClick, href, external, meta = false }) {
  const sx = meta ? metaLinkSx : linkSx;

  if (href) {
    return (
      <Link
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        underline="hover"
        sx={sx}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link component="button" type="button" onClick={onClick} underline="hover" sx={sx}>
      {children}
    </Link>
  );
}

FooterLink.propTypes = {
  children: PropTypes.node,
  onClick: PropTypes.func,
  href: PropTypes.string,
  external: PropTypes.bool,
  meta: PropTypes.bool,
};

function FooterColumn({ title, children }) {
  return (
    <Stack spacing={1.25} component="nav" aria-label={title}>
      <Typography variant="eyebrow" color="text.secondary" sx={{ letterSpacing: '0.08em' }}>
        {title}
      </Typography>
      <Stack spacing={0.5} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {children}
      </Stack>
    </Stack>
  );
}

FooterColumn.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
};

function FooterColumnItem({ children }) {
  return <Box component="li">{children}</Box>;
}

FooterColumnItem.propTypes = {
  children: PropTypes.node,
};

function MetaDot() {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{ color: 'text.disabled', px: 0.75, userSelect: 'none' }}
    >
      ·
    </Box>
  );
}

function MetaLine({ children }) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      component="div"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        rowGap: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}

MetaLine.propTypes = {
  children: PropTypes.node,
};

function FooterMetaBar({
  reportDate,
  version,
  authRequired,
  userEmail,
  onSignOut,
  t,
}) {
  return (
    <Box
      sx={(theme) => ({
        ...FOOTER_META_SX(theme),
      })}
    >
      <Box
        sx={(theme) => ({
          ...FOOTER_SHELL_SX(theme),
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: theme.spacing(1.5),
          paddingTop: theme.spacing(1.75),
          paddingBottom: theme.spacing(1.75),
        })}
      >
        <MetaLine>
          <span>{COPYRIGHT}</span>
          {reportDate && (
            <>
              <MetaDot />
              <span>{t('footer.assessmentDate').replace('{date}', formatDate(reportDate))}</span>
            </>
          )}
          {version && (
            <>
              <MetaDot />
              <span>{t('footer.version').replace('{version}', version)}</span>
            </>
          )}
        </MetaLine>

        <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
          {authRequired && userEmail && (
            <MetaLine>
              <Box
                component="span"
                sx={{
                  maxWidth: { xs: '100%', sm: 240 },
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('settings.signedInAs')} {userEmail}
              </Box>
              <MetaDot />
              <FooterLink meta onClick={onSignOut}>
                {t('settings.signOut')}
              </FooterLink>
            </MetaLine>
          )}
          <LanguageSelector appearance="ghost" />
        </Stack>
      </Box>
    </Box>
  );
}

FooterMetaBar.propTypes = {
  reportDate: PropTypes.string,
  version: PropTypes.string,
  authRequired: PropTypes.bool,
  userEmail: PropTypes.string,
  onSignOut: PropTypes.func,
  t: PropTypes.func.isRequired,
};

export function SiteFooter({
  variant = 'full',
  reportDate,
  onGoToAssessment,
  onSendEvidence,
  onNavigateTab,
  onOpenDocs,
  onOpenSettings,
  onSignOut,
  authRequired = false,
  user,
  docsBaseUrl = getDocsBaseUrl(),
}) {
  const { t } = useLanguage();
  const supportEmail = getSupportEmail();
  const version = String(import.meta.env.VITE_APP_VERSION ?? '').trim();
  const userEmail = user?.email ?? '';

  const handleContact = useCallback(() => {
    if (supportEmail) {
      globalThis.location.href = 'mailto:' + supportEmail;
      return;
    }
    onOpenSettings?.();
  }, [onOpenSettings, supportEmail]);

  const navigateToTrends = useCallback(() => {
    onNavigateTab?.('trends');
  }, [onNavigateTab]);

  const navigateToSocialMedia = useCallback(() => {
    onNavigateTab?.('social-media');
  }, [onNavigateTab]);

  const navigateToPboReports = useCallback(() => {
    onNavigateTab?.('pbo-reports');
  }, [onNavigateTab]);

  const openGetStartedDocs = useCallback(() => {
    onOpenDocs?.('getting-started/get-started');
  }, [onOpenDocs]);

  const openDocsHome = useCallback(() => {
    onOpenDocs?.();
  }, [onOpenDocs]);

  const openScoringDocs = useCallback(() => {
    onOpenDocs?.('concepts/scoring-model');
  }, [onOpenDocs]);

  const openTermsDocs = useCallback(() => {
    onOpenDocs?.('getting-started/using-the-app');
  }, [onOpenDocs]);

  const openDataHandlingDocs = useCallback(() => {
    onOpenDocs?.('concepts/system-dataflow');
  }, [onOpenDocs]);

  const getStartedHref = joinDocsPath(docsBaseUrl, 'getting-started/get-started');

  if (variant === 'minimal') {
    return (
      <Box
        component="footer"
        aria-label={t('footer.ariaLabel')}
        sx={(theme) => ({
          ...FOOTER_ROOT_SX(theme),
        })}
      >
        <Box sx={(theme) => ({ ...FOOTER_SHELL_SX(theme), paddingTop: theme.spacing(3), paddingBottom: theme.spacing(2) })}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
            spacing={2}
          >
            <Stack spacing={0.35}>
              <Typography variant="cardTitle" component="p">
                Vibes Witch
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('footer.tagline')}
              </Typography>
            </Stack>
            <Stack direction="row" flexWrap="wrap" spacing={2} useFlexGap>
              <FooterLink href={getStartedHref} external>
                {t('footer.link.getStarted')}
              </FooterLink>
              <FooterLink href={docsBaseUrl} external>
                {t('app.docs')}
              </FooterLink>
            </Stack>
          </Stack>
        </Box>
        <FooterMetaBar
          reportDate={null}
          version={version}
          authRequired={false}
          userEmail=""
          onSignOut={onSignOut}
          t={t}
        />
      </Box>
    );
  }

  return (
    <Box
      component="footer"
      aria-label={t('footer.ariaLabel')}
      sx={(theme) => ({
        ...FOOTER_ROOT_SX(theme),
      })}
    >
      <Box
        sx={(theme) => ({
          ...FOOTER_SHELL_SX(theme),
          paddingTop: theme.spacing(4),
          paddingBottom: theme.spacing(3),
          [theme.breakpoints.down('sm')]: {
            paddingTop: theme.spacing(3),
          },
        })}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: 'minmax(220px, 1.15fr) repeat(3, minmax(0, 1fr))',
            },
            columnGap: { xs: 0, md: 4 },
            rowGap: { xs: 3, md: 0 },
            alignItems: 'start',
          }}
        >
          <Stack spacing={0.75} sx={{ pr: { md: 2 }, pb: { xs: 0, md: 0 } }}>
            <Typography variant="cardTitle" component="p">
              Vibes Witch
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('footer.tagline')}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.55, maxWidth: 320 }}>
              {t('footer.description')}
            </Typography>
          </Stack>

          <FooterColumn title={t('footer.column.product')}>
            <FooterColumnItem>
              <FooterLink onClick={onGoToAssessment}>
                {t('nav.dailyAssessment')}
              </FooterLink>
            </FooterColumnItem>
            <FooterColumnItem>
              <FooterLink onClick={onSendEvidence}>
                {t('app.sendEvidence')}
              </FooterLink>
            </FooterColumnItem>
            <FooterColumnItem>
              <FooterLink onClick={navigateToTrends}>
                {t('tab.trends')}
              </FooterLink>
            </FooterColumnItem>
            <FooterColumnItem>
              <FooterLink onClick={navigateToSocialMedia}>
                {t('tab.socialMedia')}
              </FooterLink>
            </FooterColumnItem>
            <FooterColumnItem>
              <FooterLink onClick={navigateToPboReports}>
                {t('tab.pboReports')}
              </FooterLink>
            </FooterColumnItem>
          </FooterColumn>

          <FooterColumn title={t('footer.column.help')}>
            <FooterColumnItem>
              <FooterLink onClick={openGetStartedDocs}>
                {t('footer.link.getStarted')}
              </FooterLink>
            </FooterColumnItem>
            <FooterColumnItem>
              <FooterLink onClick={openDocsHome}>
                {t('app.docs')}
              </FooterLink>
            </FooterColumnItem>
            <FooterColumnItem>
              <FooterLink onClick={openScoringDocs}>
                {t('footer.link.scoring')}
              </FooterLink>
            </FooterColumnItem>
            <FooterColumnItem>
              <FooterLink onClick={handleContact}>
                {t('footer.link.contact')}
              </FooterLink>
            </FooterColumnItem>
          </FooterColumn>

          <FooterColumn title={t('footer.column.legal')}>
            <FooterColumnItem>
              <FooterLink onClick={onOpenSettings}>
                {t('settings.section.privacy')}
              </FooterLink>
            </FooterColumnItem>
            <FooterColumnItem>
              <FooterLink onClick={openTermsDocs}>
                {t('footer.link.terms')}
              </FooterLink>
            </FooterColumnItem>
            <FooterColumnItem>
              <FooterLink onClick={openDataHandlingDocs}>
                {t('footer.link.dataHandling')}
              </FooterLink>
            </FooterColumnItem>
          </FooterColumn>
        </Box>
      </Box>

      <FooterMetaBar
        reportDate={reportDate}
        version={version}
        authRequired={authRequired}
        userEmail={userEmail}
        onSignOut={onSignOut}
        t={t}
      />
    </Box>
  );
}

SiteFooter.propTypes = {
  variant: PropTypes.oneOf(['full', 'minimal']),
  reportDate: PropTypes.string,
  onGoToAssessment: PropTypes.func,
  onSendEvidence: PropTypes.func,
  onNavigateTab: PropTypes.func,
  onOpenDocs: PropTypes.func,
  onOpenSettings: PropTypes.func,
  onSignOut: PropTypes.func,
  authRequired: PropTypes.bool,
  user: PropTypes.shape({ email: PropTypes.string }),
  docsBaseUrl: PropTypes.string,
};
