import { useCallback, useEffect, useRef, useState } from 'react';
import { openPanelPopup } from '../lib/panelPopup.js';
import { isKnownPanelId } from '../lib/panelRoutes.js';
import { parsePanelMessage, PANEL_MESSAGE_TYPES } from '../lib/panelMessages.js';

const TRACKED_PANEL_IDS = ['report-build', 'send-evidence', 'settings', 'chat', 'docs'];

function emptyOpenState() {
  return {
    'report-build': false,
    'send-evidence': false,
    settings: false,
    chat: false,
    docs: false,
  };
}

/**
 * @param {{
 *   onEvidenceSubmissionComplete?: (notice: { severity?: string, message?: string }) => void,
 *   onOpenDocs?: (slug?: string) => void,
 * }} [options]
 */
export function usePanelPopups({ onEvidenceSubmissionComplete, onOpenDocs } = {}) {
  /** @type {import('react').MutableRefObject<Record<string, Window | null>>} */
  const windowsRef = useRef({
    'report-build': null,
    'send-evidence': null,
    settings: null,
    chat: null,
    docs: null,
  });
  const [openPanels, setOpenPanels] = useState(emptyOpenState);

  const open = useCallback((panelId, options = {}) => {
    if (!isKnownPanelId(panelId)) return null;
    const popup = openPanelPopup(panelId, windowsRef.current[panelId], options);
    windowsRef.current[panelId] = popup;
    setOpenPanels((prev) => ({
      ...prev,
      [panelId]: Boolean(popup && !popup.closed),
    }));
    return popup;
  }, []);

  const isOpen = useCallback(
    (panelId) => Boolean(openPanels[panelId]),
    [openPanels],
  );

  useEffect(() => {
    const intervalId = globalThis.setInterval(() => {
      setOpenPanels((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const panelId of TRACKED_PANEL_IDS) {
          const popup = windowsRef.current[panelId];
          const stillOpen = Boolean(popup && !popup.closed);
          if (next[panelId] !== stillOpen) {
            next[panelId] = stillOpen;
            changed = true;
          }
          if (!stillOpen) {
            windowsRef.current[panelId] = null;
          }
        }
        return changed ? next : prev;
      });
    }, 500);
    return () => globalThis.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (event.origin !== globalThis.location?.origin) return;
      const message = parsePanelMessage(event.data);
      if (!message) return;
      if (message.type === PANEL_MESSAGE_TYPES.EVIDENCE_SUBMISSION_COMPLETE) {
        const notice = /** @type {{ notice?: { severity?: string, message?: string } }} */ (message).notice;
        if (notice) onEvidenceSubmissionComplete?.(notice);
      }
      if (message.type === PANEL_MESSAGE_TYPES.OPEN_DOCS) {
        const slug = /** @type {{ slug?: string }} */ (message).slug;
        onOpenDocs?.(slug ?? '');
      }
    };
    globalThis.addEventListener('message', handler);
    return () => globalThis.removeEventListener('message', handler);
  }, [onEvidenceSubmissionComplete, onOpenDocs]);

  return { open, isOpen, openPanels };
}
