import { useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import { ReportBuildPanel } from './components/ReportBuildPanel.jsx';
import { SendEvidencePanel } from './components/SendEvidencePanel.jsx';
import { SettingsPanel } from './components/SettingsPanel.jsx';
import { isKnownPanelId } from './lib/panelRoutes.js';
import { createPanelMessage, PANEL_MESSAGE_TYPES, postToOpener } from './lib/panelMessages.js';
import PropTypes from 'prop-types';

function closePopupWindow() {
  globalThis.window?.close();
}

export function PanelWindowApp({ panelId }) {
  const handleClose = useCallback(() => {
    closePopupWindow();
  }, []);

  const handleEvidenceSubmissionComplete = useCallback((notice) => {
    postToOpener(createPanelMessage(PANEL_MESSAGE_TYPES.EVIDENCE_SUBMISSION_COMPLETE, { notice }));
  }, []);

  const handleOpenDocs = useCallback(() => {
    postToOpener(createPanelMessage(PANEL_MESSAGE_TYPES.OPEN_DOCS, { slug: '' }));
    closePopupWindow();
  }, []);

  if (!isKnownPanelId(panelId)) {
    return (
      <Box sx={{ padding: 3 }}>
        <Alert severity="error">Unknown panel.</Alert>
      </Box>
    );
  }

  if (panelId === 'report-build') {
    return (
      <ReportBuildPanel variant="window" open onClose={handleClose} />
    );
  }

  if (panelId === 'send-evidence') {
    return (
      <SendEvidencePanel
        variant="window"
        open
        onClose={handleClose}
        onSubmissionComplete={handleEvidenceSubmissionComplete}
      />
    );
  }

  return (
    <SettingsPanel
      variant="window"
      open
      onClose={handleClose}
      onOpenDocs={handleOpenDocs}
    />
  );
}

PanelWindowApp.propTypes = {
  panelId: PropTypes.string.isRequired,
};

export function PanelWindowLoading() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        Loading…
      </Typography>
    </Box>
  );
}
