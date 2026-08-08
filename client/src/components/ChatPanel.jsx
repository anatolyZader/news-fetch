import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeMarkdownComponents } from '../ui/safeMarkdownComponents.js';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { citationChipLabel } from '../lib/citationLabel.js';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Alert from '@mui/material/Alert';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import { useChat } from '../hooks/useChat.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { resolveChatStreamLabel, resolveSlowWarning } from '../lib/chatStreamStatus.js';
import { groupSessionsByRecency } from '../lib/chatSessionGroups.js';
import { panelHeaderButtonSx, panelSectionRadius } from '../ui/panelChrome.js';
import { safeExternalUrl } from '../lib/safeExternalUrl.js';
import {
  chatActionsVisibilitySx,
  chatRowHoverRevealSx,
} from '../ui/responsive/responsiveSx.js';
import PropTypes from 'prop-types';

const chatFieldSx = (theme) => ({
  '& .MuiOutlinedInput-root': { borderRadius: panelSectionRadius(theme) },
  '& .MuiOutlinedInput-notchedOutline': { borderRadius: panelSectionRadius(theme) },
});

const LS_CHAT_DRAFT = 'chatComposerDraft';

function readStoredDraft() {
  try {
    return localStorage.getItem(LS_CHAT_DRAFT) ?? '';
  } catch {
    return '';
  }
}

function storeDraft(value) {
  try {
    if (value) localStorage.setItem(LS_CHAT_DRAFT, value);
    else localStorage.removeItem(LS_CHAT_DRAFT);
  } catch { /* storage unavailable */ }
}

const blinkCaretSx = {
  display: 'inline-block',
  width: 2,
  height: '1em',
  background: 'currentColor',
  marginLeft: '2px',
  verticalAlign: 'text-bottom',
  animation: 'chat-blink 0.8s step-end infinite',
  '@keyframes chat-blink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } },
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
};

function ChatCodeBlock({ copyLabel, ...preProps }) {
  const preRef = useRef(null);
  return (
    <Box sx={{ position: 'relative', maxWidth: '100%' }}>
      <IconButton
        size="small"
        aria-label={copyLabel}
        title={copyLabel}
        onClick={() => navigator.clipboard?.writeText(preRef.current?.innerText ?? '')}
        sx={{
          position: 'absolute',
          top: 2,
          insetInlineEnd: 2,
          opacity: 0.55,
          '&:hover': { opacity: 1 },
        }}
      >
        <ContentCopyIcon sx={{ fontSize: 14 }} />
      </IconButton>
      <pre {...preProps} />
    </Box>
  );
}

ChatCodeBlock.propTypes = {
  copyLabel: PropTypes.string.isRequired,
};

/** GFM tables must scroll inside their own container in a 480px popup. */
function buildChatMarkdownComponents(t) {
  return {
    ...safeMarkdownComponents,
    table: ({ node: _node, ...rest }) => (
      <Box sx={{ maxWidth: '100%', overflowX: 'auto' }}>
        <table {...rest} />
      </Box>
    ),
    pre: ({ node: _node, ...rest }) => (
      <ChatCodeBlock copyLabel={t('chat.copy')} {...rest} />
    ),
  };
}

function CitationSourceLink({ url }) {
  const safeUrl = safeExternalUrl(url);
  if (!safeUrl) return null;
  return (
    <Link
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer"
      variant="body2"
      sx={{ marginRight: 'auto' }}
    >
      {safeUrl.slice(0, 60)}
    </Link>
  );
}

CitationSourceLink.propTypes = {
  url: PropTypes.string,
};

/** Persisted stopped-flag renders as a banner alongside explicit banners. */
function resolveRowBanner(meta) {
  if (meta?.banner) return meta.banner;
  if (meta?.stopped) return 'stopped';
  return null;
}

export function ChatPanel({
  reportScope,
  reportGeoScope = 'national',
  onClose,
  variant = 'embedded',
  toolProfile = 'default',
  systemHint = null,
  initialMessage = null,
}) {
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    renameSession,
    deleteSession,
    history,
    streaming,
    draft,
    streamState,
    elapsedSec,
    send,
    editMessage,
    regenerateLast,
    refreshSessions,
    stop,
    pendingActions,
    confirmAction,
    fetchSource,
    todayStr,
  } = useChat();
  const seededInitialRef = useRef(false);
  const { t, lang } = useLanguage();
  const [input, setInput] = useState(readStoredDraft);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [historyAnchor, setHistoryAnchor] = useState(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [sessionActionError, setSessionActionError] = useState(null);
  const [sourceView, setSourceView] = useState(null);
  const [atBottom, setAtBottom] = useState(true);
  const bottomRef = useRef(null);
  const scrollBoxRef = useRef(null);
  const composerRef = useRef(null);
  const closeChatButtonRef = useRef(null);
  const prevStreamingRef = useRef(false);
  const [completedAnnounce, setCompletedAnnounce] = useState('');

  // Draft survives closing the panel / popup (parity with activeTab etc.).
  useEffect(() => { storeDraft(input); }, [input]);

  async function openSource(citation) {
    setSourceView({ citation, loading: true, text: '', error: null });
    try {
      const data = await fetchSource(citation.source_id);
      setSourceView({ citation, loading: false, text: data?.text ?? '', error: null });
    } catch (err) {
      setSourceView({ citation, loading: false, text: '', error: err?.message ?? t('chat.sourceLoadFailed') });
    }
  }

  // Stick to the bottom only while the user is already there; a reader who
  // scrolled up must not be yanked down by every streamed token.
  const handleScroll = useCallback(() => {
    const el = scrollBoxRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distance < 80);
  }, []);

  useEffect(() => {
    if (!atBottom) return;
    if (history.length > 0 || draft) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, draft, atBottom]);

  // Announce completion to screen readers and return focus to the composer.
  useEffect(() => {
    if (prevStreamingRef.current && !streaming) {
      setCompletedAnnounce(t('chat.completed'));
      const timer = setTimeout(() => setCompletedAnnounce(''), 3000);
      composerRef.current?.focus();
      prevStreamingRef.current = streaming;
      return () => clearTimeout(timer);
    }
    prevStreamingRef.current = streaming;
    return undefined;
  }, [streaming, t]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (deleteConfirmOpen) {
          if (!deleteBusy) setDeleteConfirmOpen(false);
          return;
        }
        if (renameOpen) {
          if (!renameBusy) setRenameOpen(false);
          return;
        }
        if (closeConfirmOpen) {
          setCloseConfirmOpen(false);
          return;
        }
        if (searchOpen) setSearchOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [searchOpen, closeConfirmOpen, deleteConfirmOpen, deleteBusy, renameOpen, renameBusy]);

  const visibleHistory = useMemo(() => {
    const q = String(search ?? '').trim().toLowerCase();
    if (!q) return history;
    return history.filter((m) => String(m.content ?? '').toLowerCase().includes(q));
  }, [history, search]);

  // Very long transcripts render only a tail window — every row is a markdown
  // tree, and hundreds of them make streaming re-renders crawl. The window is
  // keyed to the session so switching chats resets it without an effect.
  const HISTORY_TAIL = 60;
  const [windowState, setWindowState] = useState({ sessionId: null, limit: HISTORY_TAIL });
  const historyWindow = windowState.sessionId === activeSessionId ? windowState.limit : HISTORY_TAIL;
  const windowedHistory = useMemo(
    () => (search ? visibleHistory : visibleHistory.slice(-historyWindow)),
    [visibleHistory, historyWindow, search],
  );
  const earlierHiddenCount = search ? 0 : Math.max(0, visibleHistory.length - historyWindow);

  const chatSendOpts = useMemo(() => ({
    reportGeoScope,
    toolProfile,
    view: 'user',
    systemHint,
    scope: reportScope?.type === 'component' ? reportScope.id : null,
    lang,
  }), [reportGeoScope, toolProfile, systemHint, reportScope, lang]);

  useEffect(() => {
    seededInitialRef.current = false;
  }, [initialMessage, toolProfile, systemHint]);

  useEffect(() => {
    const msg = String(initialMessage ?? '').trim();
    if (!msg || !activeSessionId || streaming || seededInitialRef.current) return;
    seededInitialRef.current = true;
    send(msg, chatSendOpts);
  }, [initialMessage, activeSessionId, streaming, send, chatSendOpts]);

  function submit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    if (editing?.messageId) {
      editMessage(editing.messageId, text, chatSendOpts);
    } else {
      send(text, chatSendOpts);
    }
    setEditing(null);
    setInput('');
  }

  // Edit only works on persisted messages (they carry a server id); local
  // optimistic rows get their id via the post-turn transcript sync.
  function startEditMessage(msg) {
    if (!msg?.id) return;
    setEditing({ messageId: msg.id });
    setInput(msg.content ?? '');
    composerRef.current?.focus();
  }

  function cancelEditing() {
    setEditing(null);
    setInput('');
  }

  function onComposerKeyDown(e) {
    if (e.key === 'ArrowUp' && !input.trim() && !streaming) {
      const lastUser = history.findLast?.((m) => m.role === 'user' && m.id);
      if (lastUser) {
        e.preventDefault();
        startEditMessage(lastUser);
      }
      return;
    }
    if (e.key === 'Escape' && editing) {
      cancelEditing();
      return;
    }
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return;
    e.preventDefault();
    submit(e);
  }

  const followupSuggestions = useMemo(() => {
    if (streaming || history.length === 0) return [];
    const last = history[history.length - 1];
    if (last?.role !== 'assistant' || last.error) return [];
    return last.meta?.suggestions ?? [];
  }, [history, streaming]);

  const chatMarkdownComponents = useMemo(() => buildChatMarkdownComponents(t), [t]);

  const starters = useMemo(
    () => [1, 2, 3, 4]
      .map((n) => t(`chat.starter.${n}`))
      .filter((s) => s && !s.startsWith('chat.starter.')),
    [t],
  );

  const closeMenu = () => setMenuAnchor(null);
  const closeHistory = () => setHistoryAnchor(null);

  useEffect(() => {
    if (variant !== 'window') return undefined;
    const previous = document.title;
    document.title = `${t('chat.ariaDialog')} · Srulik's lab`;
    return () => {
      document.title = previous;
    };
  }, [variant, t]);

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: variant === 'window' ? '100vh' : '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        sx={(theme) => ({
          paddingTop: theme.spacing(1),
          paddingBottom: theme.spacing(1),
          paddingLeft: theme.spacing(1.25),
          paddingRight: theme.spacing(1.25),
          borderBottom: theme.custom.border.hairline,
          background: theme.custom.surface.chatHeader,
        })}
      >
        <IconButton
          size="small"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          aria-label={t('chat.menu')}
          title={t('chat.menu')}
          aria-haspopup="menu"
          sx={(theme) => ({
            border: theme.custom.border.hairline,
            borderRadius: panelSectionRadius(theme),
            color: theme.palette.text.secondary,
          })}
        >
          ⋯
        </IconButton>
        <Button
          variant="outlined"
          size="small"
          onClick={(e) => {
            setHistoryAnchor(e.currentTarget);
            refreshSessions().catch(() => {});
          }}
          sx={(theme) => ({
            ...panelHeaderButtonSx(theme),
            borderColor: theme.palette.divider,
          })}
        >
          {t('chat.historyBtn')}
        </Button>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={(theme) => ({ marginInlineStart: theme.spacing(0.75), minWidth: 0, flexShrink: 1 })}
        >
          {sessions.find((s) => s.id === activeSessionId)?.title?.trim() || ''}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {variant !== 'window' && (
          <IconButton
            ref={closeChatButtonRef}
            size="small"
            aria-label={t('chat.launcherWhenOpen')}
            title={t('chat.launcherWhenOpen')}
            onClick={() => {
              if (closeConfirmOpen) {
                setCloseConfirmOpen(false);
                return;
              }
              setMenuAnchor(null);
              setHistoryAnchor(null);
              setCloseConfirmOpen(true);
            }}
            sx={(theme) => ({
              color: theme.palette.text.secondary,
              '&:hover': { color: theme.palette.text.primary },
            })}
          >
            <CancelOutlinedIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {variant !== 'window' && closeConfirmOpen && (
        <ClickAwayListener
          onClickAway={(e) => {
            const t = e?.target;
            if (t instanceof Node && closeChatButtonRef.current?.contains(t)) return;
            setCloseConfirmOpen(false);
          }}
          touchEvent="onTouchEnd"
        >
          <Paper
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-exit-confirm-title"
            variant="outlined"
            tabIndex={-1}
            sx={(theme) => ({
              position: 'absolute',
              zIndex: 2,
              left: theme.spacing(1.25),
              right: theme.spacing(1.25),
              top: theme.spacing(6.5),
              maxWidth: 360,
              borderRadius: panelSectionRadius(theme),
              boxShadow: theme.custom.elevation.modal,
              background: theme.palette.background.paper,
              border: theme.custom.border.hairline,
            })}
          >
            <Box
              sx={(theme) => ({
                padding: theme.spacing(2.5),
                display: 'flex',
                flexDirection: 'column',
                gap: theme.spacing(1.5),
              })}
            >
              <Typography
                id="chat-exit-confirm-title"
                variant="h2"
                component="h2"
                sx={(theme) => ({ fontSize: theme.typography.h2.fontSize, fontWeight: 600 })}
              >
                {t('chat.closeTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                {t('chat.closeBody')}
              </Typography>
              <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  sx={panelHeaderButtonSx}
                  onClick={() => setCloseConfirmOpen(false)}
                  autoFocus
                >
                  {t('chat.closeStay')}
                </Button>
                <Button
                  type="button"
                  variant="contained"
                  size="small"
                  sx={panelHeaderButtonSx}
                  onClick={() => {
                    setCloseConfirmOpen(false);
                    onClose?.();
                  }}
                >
                  {t('chat.closeExit')}
                </Button>
              </Stack>
            </Box>
          </Paper>
        </ClickAwayListener>
      )}

      <Menu
        anchorEl={historyAnchor}
        open={Boolean(historyAnchor)}
        onClose={closeHistory}
        slotProps={{ paper: { sx: { minWidth: 220, maxHeight: 'min(50vh, 360px)' } } }}
      >
        {sessions.length === 0 && (
          <MenuItem disabled>{t('chat.history.none')}</MenuItem>
        )}
        {groupSessionsByRecency(sessions, todayStr).flatMap((group) => [
          <MenuItem key={`header-${group.key}`} disabled dense>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {t(`chat.history.${group.key}`)}
            </Typography>
          </MenuItem>,
          ...group.sessions.map((s) => (
            <MenuItem
              key={s.id}
              selected={s.id === activeSessionId}
              onClick={() => {
                setActiveSessionId(s.id);
                closeHistory();
              }}
            >
              <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                {s.title?.trim() ? s.title.trim() : t('chat.history.untitled')}
              </Box>
              {s.report_date && s.report_date !== todayStr && (
                <Typography variant="caption" color="text.secondary" sx={{ marginLeft: 1, flexShrink: 0 }}>
                  {s.report_date}
                </Typography>
              )}
            </MenuItem>
          )),
        ])}
      </Menu>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        <MenuItem
          onClick={() => {
            setSearchOpen((v) => !v);
            closeMenu();
          }}
        >
          {searchOpen ? t('chat.search.hide') : t('chat.search.show')}
        </MenuItem>
        <MenuItem
          onClick={() => {
            const sel = globalThis.getSelection?.()?.toString?.() ?? '';
            const text = String(sel).trim();
            if (text) {
              const quoted = text.split('\n').map((l) => `> ${l}`).join('\n');
              setInput((prev) => (prev ? `${prev}\n\n${quoted}` : quoted));
            }
            closeMenu();
          }}
        >
          {t('chat.quoteSelection')}
        </MenuItem>
        <MenuItem
          disabled={!activeSessionId || streaming}
          onClick={async () => {
            closeMenu();
            await regenerateLast(chatSendOpts);
          }}
        >
          {t('chat.retry')}
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={async () => {
            await createSession({ title: '' });
            closeMenu();
          }}
        >
          {t('chat.newChat')}
        </MenuItem>
        <MenuItem
          disabled={!activeSessionId}
          onClick={() => {
            // Native window.prompt/confirm inside a closing MUI Menu is
            // unreliable (focus restore cancels it). Dialogs instead.
            closeMenu();
            setSessionActionError(null);
            setRenameValue(sessions.find((s) => s.id === activeSessionId)?.title ?? '');
            setRenameOpen(true);
          }}
        >
          {t('chat.rename.menu')}
        </MenuItem>
        <MenuItem
          disabled={!activeSessionId}
          sx={{ color: 'error.main', fontWeight: 600 }}
          onClick={() => {
            closeMenu();
            setSessionActionError(null);
            setDeleteConfirmOpen(true);
          }}
        >
          {t('chat.delete.menu')}
        </MenuItem>
      </Menu>

      <Box
        ref={scrollBoxRef}
        onScroll={handleScroll}
        sx={(theme) => ({
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflowX: 'hidden',
          overflowY: 'auto',
          paddingTop: theme.spacing(0.5),
          paddingBottom: theme.spacing(0.5),
          display: 'flex',
          flexDirection: 'column',
          background: theme.palette.background.paper,
        })}
      >
        {history.length === 0 && (
          <Box sx={(theme) => ({ marginTop: theme.spacing(4), marginX: 'auto', maxWidth: '46ch', paddingX: theme.spacing(2) })}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ textAlign: 'center' }}
            >
              {t('chat.placeholder')}
            </Typography>
            {starters.length > 0 && !streaming && (
              <Stack
                direction="row"
                spacing={0.75}
                useFlexGap
                flexWrap="wrap"
                justifyContent="center"
                sx={(theme) => ({ marginTop: theme.spacing(2) })}
              >
                {starters.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    variant="outlined"
                    clickable
                    onClick={() => send(s, chatSendOpts)}
                    sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
                  />
                ))}
              </Stack>
            )}
          </Box>
        )}
        {earlierHiddenCount > 0 && (
          <Button
            size="small"
            variant="text"
            onClick={() => setWindowState({ sessionId: activeSessionId, limit: historyWindow + HISTORY_TAIL })}
            sx={{ alignSelf: 'center', my: 0.5 }}
          >
            {t('chat.showEarlier', { count: earlierHiddenCount })}
          </Button>
        )}
        {windowedHistory.map((msg, idx) => {
          const isLast = idx === windowedHistory.length - 1;
          const banner = resolveRowBanner(msg.meta) ?? (msg.error ? 'error' : null);
          const showRegenerate = !streaming && !search
            && msg.role === 'assistant' && isLast;
          return (
            <Box
              key={msg.id ?? `${msg.role}-${idx}-${String(msg.content ?? '').slice(0, 48)}`}
              sx={{ minWidth: 0, maxWidth: '100%' }}
            >
              <ChatRow
                msg={msg}
                t={t}
                markdownComponents={chatMarkdownComponents}
                onCopy={() => navigator.clipboard?.writeText(msg.content ?? '')}
                onEdit={msg.role === 'user' && msg.id ? () => startEditMessage(msg) : undefined}
                onRegenerate={showRegenerate ? () => regenerateLast(chatSendOpts) : undefined}
                onOpenSource={openSource}
              />
              {banner && (
                <ChatCompletionBanner
                  banner={banner}
                  t={t}
                  action={(banner === 'error' || banner === 'connection_lost') && isLast && !streaming ? (
                    <Button size="small" color="inherit" onClick={() => regenerateLast(chatSendOpts)}>
                      {t('chat.retry')}
                    </Button>
                  ) : undefined}
                />
              )}
            </Box>
          );
        })}
        {followupSuggestions.length > 0 && !search && (
          <Stack
            direction="row"
            spacing={0.75}
            useFlexGap
            flexWrap="wrap"
            sx={(theme) => ({ padding: theme.spacing(0.5, 1.5, 1.5, 6) })}
          >
            {followupSuggestions.map((s) => (
              <Chip
                key={s}
                label={s}
                size="small"
                variant="outlined"
                color="primary"
                clickable
                onClick={() => send(s, chatSendOpts)}
                sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', overflowWrap: 'anywhere', py: 0.4 } }}
              />
            ))}
          </Stack>
        )}
        {streaming && (
          <ChatWorkingRow
            streamState={streamState}
            draft={draft}
            elapsedSec={elapsedSec}
            t={t}
            markdownComponents={chatMarkdownComponents}
          />
        )}
        <div ref={bottomRef} />
      </Box>

      {!atBottom && (
        <Box sx={{ position: 'relative' }}>
          <IconButton
            size="small"
            aria-label={t('chat.jumpToLatest')}
            title={t('chat.jumpToLatest')}
            onClick={() => {
              setAtBottom(true);
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            sx={(theme) => ({
              position: 'absolute',
              bottom: theme.spacing(1),
              insetInlineEnd: theme.spacing(2),
              zIndex: 1,
              background: theme.palette.background.paper,
              border: theme.custom.border.hairline,
              boxShadow: theme.custom.elevation.cta,
              '&:hover': { background: theme.palette.background.default },
            })}
          >
            <KeyboardArrowDownIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {searchOpen && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          role="search"
          aria-label={t('chat.search.show')}
          sx={(theme) => ({
            paddingTop: theme.spacing(1),
            paddingBottom: theme.spacing(1),
            paddingLeft: theme.spacing(1.25),
            paddingRight: theme.spacing(1.25),
            borderTop: theme.custom.border.hairline,
            background: theme.palette.background.paper,
          })}
        >
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('chat.search.placeholder')}
            inputProps={{ 'aria-label': t('chat.search.placeholder'), dir: 'auto' }}
            autoFocus
            size="small"
            fullWidth
            sx={(theme) => ({
              ...chatFieldSx(theme),
              '& .MuiOutlinedInput-root': {
                background: theme.palette.background.default,
              },
            })}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={() => setSearchOpen(false)}
            sx={panelHeaderButtonSx}
          >
            {t('chat.close')}
          </Button>
        </Stack>
      )}

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteConfirmOpen(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '1rem' }}>{t('chat.delete.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('chat.delete.body')}
          </Typography>
          {sessionActionError && (
            <Alert severity="error" variant="outlined" sx={{ mt: 1.5 }}>
              {sessionActionError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            size="small"
            disabled={deleteBusy}
            onClick={() => setDeleteConfirmOpen(false)}
          >
            {t('chat.cancel')}
          </Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            disabled={deleteBusy || !activeSessionId}
            onClick={async () => {
              if (!activeSessionId) return;
              setDeleteBusy(true);
              setSessionActionError(null);
              try {
                await deleteSession({ sessionId: activeSessionId });
                setDeleteConfirmOpen(false);
              } catch (err) {
                setSessionActionError(err?.message ?? t('chat.delete.failed'));
              } finally {
                setDeleteBusy(false);
              }
            }}
          >
            {deleteBusy ? t('chat.delete.busy') : t('chat.delete.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={renameOpen}
        onClose={() => {
          if (renameBusy) return;
          setRenameOpen(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '1rem' }}>{t('chat.rename.title')}</DialogTitle>
        <DialogContent>
          <TextField
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            label={t('chat.rename.label')}
            inputProps={{ dir: 'auto', maxLength: 120 }}
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('chat-rename-save')?.click();
              }
            }}
          />
          {sessionActionError && (
            <Alert severity="error" variant="outlined" sx={{ mt: 1.5 }}>
              {sessionActionError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            size="small"
            disabled={renameBusy}
            onClick={() => setRenameOpen(false)}
          >
            {t('chat.cancel')}
          </Button>
          <Button
            id="chat-rename-save"
            size="small"
            variant="contained"
            disabled={renameBusy || !activeSessionId}
            onClick={async () => {
              if (!activeSessionId) return;
              setRenameBusy(true);
              setSessionActionError(null);
              try {
                await renameSession({ sessionId: activeSessionId, title: renameValue.trim() });
                setRenameOpen(false);
              } catch (err) {
                setSessionActionError(err?.message ?? t('chat.delete.failed'));
              } finally {
                setRenameBusy(false);
              }
            }}
          >
            {t('chat.rename.save')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(sourceView)}
        onClose={() => setSourceView(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '0.95rem', wordBreak: 'break-all' }}>
          {sourceView?.citation?.title ?? sourceView?.citation?.source_id ?? ''}
        </DialogTitle>
        <DialogContent dividers>
          {sourceView?.loading && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={16} thickness={5} />
              <Typography variant="body2" color="text.secondary">…</Typography>
            </Stack>
          )}
          {sourceView?.error && (
            <Alert severity="error" variant="outlined">{sourceView.error}</Alert>
          )}
          {!sourceView?.loading && !sourceView?.error && (
            <Typography
              variant="body2"
              component="pre"
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', margin: 0 }}
            >
              {sourceView?.text ?? ''}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <CitationSourceLink url={sourceView?.citation?.url} />
          <Button size="small" onClick={() => setSourceView(null)}>{t('chat.close')}</Button>
        </DialogActions>
      </Dialog>

      {pendingActions.length > 0 && (
        <Stack spacing={1} sx={(theme) => ({ padding: theme.spacing(1, 1.25) })}>
          {pendingActions.map((action) => (
            <Alert
              key={action.actionId}
              severity="warning"
              variant="outlined"
              action={(
                <Stack direction="row" spacing={0.5}>
                  <Button size="small" color="inherit" onClick={() => confirmAction(action.actionId, false)}>
                    {t('chat.dismiss')}
                  </Button>
                  <Button size="small" variant="contained" onClick={() => confirmAction(action.actionId, true)}>
                    {t('chat.confirm')}
                  </Button>
                </Stack>
              )}
            >
              {action.summary || action.toolName}
            </Alert>
          ))}
        </Stack>
      )}

      {/* Screen-reader announcement when an answer completes. */}
      <Box
        role="status"
        aria-live="polite"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
        }}
      >
        {completedAnnounce}
      </Box>

      {editing && (
        <Alert
          severity="info"
          variant="outlined"
          sx={(theme) => ({ marginX: theme.spacing(1.25), marginTop: theme.spacing(1), borderRadius: panelSectionRadius(theme) })}
          action={(
            <Button size="small" color="inherit" onClick={cancelEditing}>
              {t('chat.editingCancel')}
            </Button>
          )}
        >
          {t('chat.editing')}
        </Alert>
      )}

      <Box
        component="form"
        onSubmit={submit}
        sx={(theme) => ({
          display: 'flex',
          gap: theme.spacing(1),
          paddingTop: theme.spacing(1),
          paddingBottom: theme.spacing(1),
          paddingLeft: theme.spacing(1.25),
          paddingRight: theme.spacing(1.25),
          borderTop: theme.custom.border.hairline,
          background: theme.custom.surface.chatHeader,
        })}
      >
        <TextField
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={t('chat.input')}
          disabled={streaming}
          inputRef={composerRef}
          inputProps={{ dir: 'auto' }}
          multiline
          maxRows={4}
          minRows={1}
          fullWidth
          sx={(theme) => ({
            ...chatFieldSx(theme),
            '& .MuiOutlinedInput-root': {
              background: theme.palette.background.paper,
              fontSize: theme.typography.chatBody.fontSize,
              lineHeight: theme.typography.chatBody.lineHeight,
            },
          })}
        />
        {streaming ? (
          <Button
            type="button"
            variant="contained"
            onClick={stop}
            sx={(theme) => ({
              ...panelHeaderButtonSx(theme),
              backgroundColor: theme.palette.text.secondary,
              color: theme.palette.primary.contrastText,
              '&:hover': { backgroundColor: theme.palette.text.secondary, filter: 'brightness(0.95)' },
            })}
          >
            {t('chat.stop') ?? 'Stop'}
          </Button>
        ) : (
          <Button
            type="submit"
            variant="contained"
            disabled={!input.trim()}
            sx={(theme) => ({
              ...panelHeaderButtonSx(theme),
              boxShadow: theme.custom.elevation.cta,
              '&:hover': { transform: 'translateY(-1px)' },
            })}
          >
            {t('chat.send')}
          </Button>
        )}
      </Box>
    </Box>
  );
}

ChatPanel.propTypes = {
  reportScope: PropTypes.object,
  reportGeoScope: PropTypes.string,
  onClose: PropTypes.func,
  variant: PropTypes.oneOf(['embedded', 'window']),
  toolProfile: PropTypes.string,
  systemHint: PropTypes.string,
  initialMessage: PropTypes.string,
};

function ChatAvatar({ isUser }) {
  return (
    <Box
      aria-hidden="true"
      sx={(theme) => ({
        width: theme.spacing(3.5),
        height: theme.spacing(3.5),
        borderRadius: panelSectionRadius(theme),
        display: 'grid',
        placeItems: 'center',
        fontSize: theme.typography.eyebrow.fontSize,
        fontWeight: 900,
        letterSpacing: '-0.01em',
        color: isUser ? theme.palette.primary.contrastText : theme.palette.text.secondary,
        border: `1px solid ${
          isUser ? alpha(theme.palette.primary.main, 0.55) : theme.palette.divider
        }`,
        background: isUser ? theme.palette.primary.main : theme.palette.background.paper,
      })}
    >
      {isUser ? 'You' : 'AI'}
    </Box>
  );
}

ChatAvatar.propTypes = {
  isUser: PropTypes.bool,
};

function ChatActionButton({ onClick, children }) {
  return (
    <Button
      type="button"
      variant="text"
      size="small"
      onClick={onClick}
      color="inherit"
      sx={(theme) => ({
        minHeight: theme.spacing(3.5),
        borderRadius: panelSectionRadius(theme),
        fontSize: theme.typography.caption.fontSize,
        fontWeight: 500,
        paddingTop: theme.spacing(0.25),
        paddingBottom: theme.spacing(0.25),
        paddingLeft: theme.spacing(0.75),
        paddingRight: theme.spacing(0.75),
        minWidth: 0,
        color: theme.palette.text.secondary,
        backgroundColor: 'transparent',
        '&:hover': {
          backgroundColor: theme.palette.action.hover,
          color: theme.palette.text.primary,
        },
      })}
    >
      {children}
    </Button>
  );
}

ChatActionButton.propTypes = {
  onClick: PropTypes.func,
  children: PropTypes.node,
};

const BANNER_SEVERITY = {
  loop_exhausted: 'warning',
  planning_only: 'warning',
  deterministic_fallback: 'info',
  stopped: 'info',
  connection_lost: 'error',
  error: 'error',
};

function ChatCompletionBanner({ banner, t, action }) {
  const severity = BANNER_SEVERITY[banner] ?? 'warning';
  const key = `chat.banner.${banner}`;
  return (
    <Alert
      severity={severity}
      variant="outlined"
      action={action}
      sx={(theme) => ({
        marginX: theme.spacing(1.25),
        marginBottom: theme.spacing(1),
        borderRadius: panelSectionRadius(theme),
      })}
    >
      {t(key)}
    </Alert>
  );
}

ChatCompletionBanner.propTypes = {
  banner: PropTypes.string.isRequired,
  t: PropTypes.func.isRequired,
  action: PropTypes.node,
};

function ChatWorkingRow({ streamState, draft, elapsedSec, t, markdownComponents }) {
  const label = resolveChatStreamLabel(streamState, t);
  const slowWarning = resolveSlowWarning(elapsedSec, t);
  const showSlow = elapsedSec >= 60;

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: `${theme.spacing(3.5)} minmax(0, 1fr)`,
        gap: theme.spacing(1),
        padding: theme.spacing(1.5),
        minWidth: 0,
        maxWidth: '100%',
        borderBottom: theme.custom.border.hairline,
        background: alpha(theme.palette.background.default, 0.75),
      })}
    >
      <ChatAvatar isUser={false} />
      <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <CircularProgress size={16} thickness={5} />
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Typography
            variant="caption"
            color={showSlow ? 'warning.main' : 'text.secondary'}
          >
            {t('chat.status.elapsed', { seconds: elapsedSec })}
          </Typography>
        </Stack>
        {slowWarning && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.75 }}>
            {slowWarning}
          </Typography>
        )}
        {draft ? (
          <Box
            dir="auto"
            sx={(theme) => ({
              marginTop: theme.spacing(1),
              color: theme.palette.text.primary,
              fontSize: theme.typography.chatBody.fontSize,
              lineHeight: theme.typography.chatBody.lineHeight,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            })}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents ?? safeMarkdownComponents}>
              {draft}
            </ReactMarkdown>
            <Box component="span" sx={blinkCaretSx} />
          </Box>
        ) : (
          <Box sx={(theme) => ({ marginTop: theme.spacing(1) })}>
            <Typography variant="body2" color="text.disabled">
              …
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

ChatWorkingRow.propTypes = {
  streamState: PropTypes.object.isRequired,
  draft: PropTypes.string.isRequired,
  elapsedSec: PropTypes.number.isRequired,
  t: PropTypes.func.isRequired,
  markdownComponents: PropTypes.object,
};

function ChatRow({ msg, streaming = false, t, markdownComponents, onCopy, onEdit, onRegenerate, onOpenSource }) {
  const isUser = msg.role === 'user';
  const hasActions = !streaming && Boolean(onCopy || onEdit || onRegenerate);
  const citations = !isUser && !streaming ? (msg.meta?.citations ?? []) : [];
  const toolTrail = !isUser && !streaming ? (msg.meta?.tools ?? []) : [];
  return (
    <Box
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: `${theme.spacing(3.5)} minmax(0, 1fr)`,
        gap: theme.spacing(1),
        padding: theme.spacing(1.5),
        minWidth: 0,
        maxWidth: '100%',
        borderBottom: theme.custom.border.hairline,
        background: isUser
          ? theme.palette.background.paper
          : alpha(theme.palette.background.default, 0.75),
        ...chatRowHoverRevealSx(),
        position: 'relative',
        ...(msg.error && {
          backgroundColor: `${theme.custom.surface.errorBg} !important`,
          borderColor: `${theme.custom.surface.errorBorder} !important`,
          color: theme.custom.surface.errorText,
        }),
      })}
    >
      <ChatAvatar isUser={isUser} />
      <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
        <Box
          dir="auto"
          sx={(theme) => ({
            color: theme.palette.text.primary,
            fontSize: theme.typography.chatBody.fontSize,
            lineHeight: theme.typography.chatBody.lineHeight,
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            '& h1, & h2, & h3, & h4, & h5, & h6': {
              fontSize: '1.02em',
              fontWeight: 700,
              lineHeight: 1.35,
              margin: `${theme.spacing(1.25)} 0 ${theme.spacing(0.5)}`,
            },
            '& h1': { fontSize: '1.12em' },
            '& h2': { fontSize: '1.07em' },
            '& blockquote': {
              margin: `${theme.spacing(0.75)} 0`,
              paddingInlineStart: theme.spacing(1.25),
              borderInlineStart: `3px solid ${theme.palette.divider}`,
              color: theme.palette.text.secondary,
            },
            '& table': {
              borderCollapse: 'collapse',
              fontSize: '0.92em',
              margin: `${theme.spacing(0.75)} 0`,
            },
            '& th, & td': {
              border: `1px solid ${theme.palette.divider}`,
              padding: theme.spacing(0.5, 0.75),
              textAlign: 'start',
              verticalAlign: 'top',
            },
            '& th': {
              background: theme.custom.surface.code,
              fontWeight: 700,
            },
            '& p': { margin: `${theme.spacing(0.25)} 0` },
            '& p:first-of-type': { marginTop: 0 },
            '& p:last-of-type': { marginBottom: 0 },
            '& strong': { fontWeight: 700 },
            '& ul, & ol': {
              margin: `${theme.spacing(0.75)} 0`,
              paddingLeft: theme.spacing(2.5),
            },
            '& li': { margin: `${theme.spacing(0.25)} 0` },
            '& ul > li::marker': { color: theme.palette.primary.main },
            '& ol > li::marker': { color: theme.palette.primary.main, fontWeight: 700 },
            '& code': {
              fontSize: '0.88em',
              paddingTop: theme.spacing(0.15),
              paddingBottom: theme.spacing(0.15),
              paddingLeft: theme.spacing(0.4),
              paddingRight: theme.spacing(0.4),
              borderRadius: panelSectionRadius(theme),
              background: theme.custom.surface.code,
              border: theme.custom.border.hairline,
              wordBreak: 'break-word',
            },
            '& pre': {
              maxWidth: '100%',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            },
            '& a': {
              color: 'inherit',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
              overflowWrap: 'anywhere',
            },
          })}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents ?? safeMarkdownComponents}>
            {msg.content ?? ''}
          </ReactMarkdown>
          {streaming && <Box component="span" sx={blinkCaretSx} />}
        </Box>
        {citations.length > 0 && (
          <Stack
            direction="row"
            spacing={0.5}
            flexWrap="wrap"
            useFlexGap
            sx={(theme) => ({ marginTop: theme.spacing(1), minWidth: 0, maxWidth: '100%' })}
          >
            {citations.map((c) => (
              <Chip
                key={c.source_id}
                size="small"
                variant="outlined"
                title={c.used === false && t ? `${c.source_id} — ${t('chat.consulted')}` : c.source_id}
                label={citationChipLabel(c)}
                clickable={Boolean(onOpenSource)}
                onClick={onOpenSource ? () => onOpenSource(c) : undefined}
                aria-haspopup="dialog"
                sx={{
                  maxWidth: '100%',
                  height: 'auto',
                  // Grounded-but-unused ("consulted") sources render dimmed so
                  // chips no longer imply support the answer never drew on.
                  ...(c.used === false ? { opacity: 0.55 } : {}),
                  '& .MuiChip-label': {
                    display: 'block',
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                    py: 0.25,
                  },
                }}
              />
            ))}
          </Stack>
        )}
        {toolTrail.length > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={(theme) => ({
              display: 'block',
              marginTop: theme.spacing(0.75),
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            })}
          >
            {t
              ? t('chat.investigated', { tools: [...new Set(toolTrail)].join(', ') })
              : `Investigated: ${[...new Set(toolTrail)].join(', ')}`}
          </Typography>
        )}
        {hasActions && (
          <Stack
            direction="row"
            spacing={1}
            className="chat-actions"
            sx={[
              (theme) => ({
                marginTop: theme.spacing(1.5),
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                transition: theme.transitions.create('opacity', {
                  duration: theme.transitions.duration.shortest,
                }),
              }),
              chatActionsVisibilitySx,
            ]}
          >
            {onCopy && <ChatActionButton onClick={onCopy}>{t ? t('chat.copy') : 'Copy'}</ChatActionButton>}
            {isUser && onEdit && <ChatActionButton onClick={onEdit}>{t ? t('chat.edit') : 'Edit'}</ChatActionButton>}
            {!isUser && onRegenerate && (
              <ChatActionButton onClick={onRegenerate}>{t ? t('chat.regenerate') : 'Regenerate'}</ChatActionButton>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

ChatRow.propTypes = {
  msg: PropTypes.shape({
    role: PropTypes.string,
    content: PropTypes.string,
    id: PropTypes.string,
    error: PropTypes.bool,
    meta: PropTypes.object,
  }).isRequired,
  streaming: PropTypes.bool,
  t: PropTypes.func,
  markdownComponents: PropTypes.object,
  onCopy: PropTypes.func,
  onEdit: PropTypes.func,
  onRegenerate: PropTypes.func,
  onOpenSource: PropTypes.func,
};
