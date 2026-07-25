import { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeMarkdownComponents } from '../ui/safeMarkdownComponents.js';
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
import {
  chatActionsVisibilitySx,
  chatRowHoverRevealSx,
} from '../ui/responsive/responsiveSx.js';
import PropTypes from 'prop-types';

const chatFieldSx = (theme) => ({
  '& .MuiOutlinedInput-root': { borderRadius: panelSectionRadius(theme) },
  '& .MuiOutlinedInput-notchedOutline': { borderRadius: panelSectionRadius(theme) },
});

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
    regenerateLast,
    stop,
    pendingActions,
    confirmAction,
    fetchSource,
    todayStr,
  } = useChat();
  const seededInitialRef = useRef(false);
  const { t, lang } = useLanguage();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [historyAnchor, setHistoryAnchor] = useState(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [sourceView, setSourceView] = useState(null);
  const bottomRef = useRef(null);
  const closeChatButtonRef = useRef(null);

  async function openSource(citation) {
    setSourceView({ citation, loading: true, text: '', error: null });
    try {
      const data = await fetchSource(citation.source_id);
      setSourceView({ citation, loading: false, text: data?.text ?? '', error: null });
    } catch (err) {
      setSourceView({ citation, loading: false, text: '', error: err?.message ?? 'Failed to load source' });
    }
  }

  useEffect(() => {
    if (history.length > 0 || draft) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, draft]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        if (closeConfirmOpen) {
          setCloseConfirmOpen(false);
          return;
        }
        if (searchOpen) setSearchOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [searchOpen, closeConfirmOpen]);

  const visibleHistory = useMemo(() => {
    const q = String(search ?? '').trim().toLowerCase();
    if (!q) return history;
    return history.filter((m) => String(m.content ?? '').toLowerCase().includes(q));
  }, [history, search]);

  const chatSendOpts = useMemo(() => ({
    reportGeoScope,
    toolProfile,
    view: 'operator',
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
    if (!input.trim() || streaming) return;
    send(input.trim(), chatSendOpts);
    setInput('');
  }

  function onComposerKeyDown(e) {
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return;
    e.preventDefault();
    submit(e);
  }

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
          aria-label="Menu"
          title="Menu"
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
          onClick={(e) => setHistoryAnchor(e.currentTarget)}
          sx={(theme) => ({
            ...panelHeaderButtonSx(theme),
            borderColor: theme.palette.divider,
          })}
        >
          History
        </Button>
        <Box sx={{ flex: 1 }} />
        {variant !== 'window' && (
          <IconButton
            ref={closeChatButtonRef}
            size="small"
            aria-label="Close chat"
            title="Close chat"
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
          <MenuItem disabled>No past chats yet</MenuItem>
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
                {s.title?.trim() ? s.title.trim() : 'Untitled'}
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
          {searchOpen ? 'Hide search' : 'Search'}
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
          Quote selection
        </MenuItem>
        <MenuItem
          disabled={!activeSessionId || streaming}
          onClick={async () => {
            await regenerateLast(chatSendOpts);
            closeMenu();
          }}
        >
          Retry
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={async () => {
            await createSession({ title: '' });
            closeMenu();
          }}
        >
          New chat
        </MenuItem>
        <MenuItem
          disabled={!activeSessionId}
          onClick={async () => {
            if (!activeSessionId) return;
            const current = sessions.find((s) => s.id === activeSessionId)?.title ?? '';
            const next = globalThis.prompt('Rename chat', current);
            if (next == null) return;
            await renameSession({ sessionId: activeSessionId, title: next });
            closeMenu();
          }}
        >
          Rename chat
        </MenuItem>
        <MenuItem
          disabled={!activeSessionId}
          sx={{ color: 'error.main', fontWeight: 600 }}
          onClick={async () => {
            if (!activeSessionId) return;
            const ok = globalThis.confirm('Delete this chat?');
            if (!ok) return;
            await deleteSession({ sessionId: activeSessionId });
            closeMenu();
          }}
        >
          Delete chat
        </MenuItem>
      </Menu>

      <Box
        sx={(theme) => ({
          flex: 1,
          overflowY: 'auto',
          paddingTop: theme.spacing(0.5),
          paddingBottom: theme.spacing(0.5),
          display: 'flex',
          flexDirection: 'column',
          background: theme.palette.background.paper,
        })}
      >
        {history.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={(theme) => ({
              textAlign: 'center',
              marginTop: theme.spacing(4),
              marginX: 'auto',
              maxWidth: '40ch',
            })}
          >
            {t('chat.placeholder')}
          </Typography>
        )}
        {visibleHistory.map((msg) => (
          <Box key={msg.id ?? `${msg.role}-${String(msg.content ?? '').slice(0, 48)}`}>
            <ChatRow
              msg={msg}
              onCopy={() => navigator.clipboard?.writeText(msg.content ?? '')}
              onEdit={() => setInput(msg.content ?? '')}
              onOpenSource={openSource}
            />
            {msg.meta?.banner && (
              <ChatCompletionBanner banner={msg.meta.banner} t={t} />
            )}
          </Box>
        ))}
        {streaming && (
          <ChatWorkingRow
            streamState={streamState}
            draft={draft}
            elapsedSec={elapsedSec}
            t={t}
          />
        )}
        <div ref={bottomRef} />
      </Box>

      {searchOpen && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          role="dialog"
          aria-label="Search chat"
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
            placeholder="Search in chat…"
            inputProps={{ 'aria-label': 'Search in chat' }}
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
            Close
          </Button>
        </Stack>
      )}

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
          {sourceView?.citation?.url && (
            <Link
              href={sourceView.citation.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
              sx={{ marginRight: 'auto' }}
            >
              {sourceView.citation.url.slice(0, 60)}
            </Link>
          )}
          <Button size="small" onClick={() => setSourceView(null)}>Close</Button>
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
                    Dismiss
                  </Button>
                  <Button size="small" variant="contained" onClick={() => confirmAction(action.actionId, true)}>
                    Confirm
                  </Button>
                </Stack>
              )}
            >
              {action.summary || action.toolName}
            </Alert>
          ))}
        </Stack>
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
  error: 'error',
};

function ChatCompletionBanner({ banner, t }) {
  const severity = BANNER_SEVERITY[banner] ?? 'warning';
  const key = `chat.banner.${banner}`;
  return (
    <Alert
      severity={severity}
      variant="outlined"
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
};

function ChatWorkingRow({ streamState, draft, elapsedSec, t }) {
  const label = resolveChatStreamLabel(streamState, t);
  const slowWarning = resolveSlowWarning(elapsedSec, t);
  const showSlow = elapsedSec >= 60;

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: `${theme.spacing(3.5)} 1fr`,
        gap: theme.spacing(1),
        padding: theme.spacing(1.5),
        borderBottom: theme.custom.border.hairline,
        background: alpha(theme.palette.background.default, 0.75),
      })}
    >
      <ChatAvatar isUser={false} />
      <Box>
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
            sx={(theme) => ({
              marginTop: theme.spacing(1),
              color: theme.palette.text.primary,
              fontSize: theme.typography.chatBody.fontSize,
              lineHeight: theme.typography.chatBody.lineHeight,
            })}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={safeMarkdownComponents}>
              {draft}
            </ReactMarkdown>
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                width: 2,
                height: '1em',
                background: 'currentColor',
                marginLeft: '2px',
                verticalAlign: 'text-bottom',
                animation: 'chat-blink 0.8s step-end infinite',
                '@keyframes chat-blink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } },
              }}
            />
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
};

function ChatRow({ msg, streaming = false, onCopy, onEdit, onOpenSource }) {
  const isUser = msg.role === 'user';
  const hasActions = !streaming && Boolean(onCopy || onEdit);
  const citations = !isUser && !streaming ? (msg.meta?.citations ?? []) : [];
  const toolTrail = !isUser && !streaming ? (msg.meta?.tools ?? []) : [];
  return (
    <Box
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: `${theme.spacing(3.5)} 1fr`,
        gap: theme.spacing(1),
        padding: theme.spacing(1.5),
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
      <Box>
        <Box
          sx={(theme) => ({
            color: theme.palette.text.primary,
            fontSize: theme.typography.chatBody.fontSize,
            lineHeight: theme.typography.chatBody.lineHeight,
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
            },
            '& a': {
              color: 'inherit',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            },
          })}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={safeMarkdownComponents}>
            {msg.content ?? ''}
          </ReactMarkdown>
          {streaming && (
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                width: 2,
                height: '1em',
                background: 'currentColor',
                marginLeft: '2px',
                verticalAlign: 'text-bottom',
                animation: 'chat-blink 0.8s step-end infinite',
                '@keyframes chat-blink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0 } },
              }}
            />
          )}
        </Box>
        {citations.length > 0 && (
          <Stack
            direction="row"
            spacing={0.5}
            flexWrap="wrap"
            useFlexGap
            sx={(theme) => ({ marginTop: theme.spacing(1) })}
          >
            {citations.map((c) => (
              <Chip
                key={c.source_id}
                size="small"
                variant="outlined"
                title={c.source_id}
                label={citationChipLabel(c)}
                clickable={Boolean(onOpenSource)}
                onClick={onOpenSource ? () => onOpenSource(c) : undefined}
              />
            ))}
          </Stack>
        )}
        {toolTrail.length > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={(theme) => ({ display: 'block', marginTop: theme.spacing(0.75) })}
          >
            {`Investigated: ${[...new Set(toolTrail)].join(', ')}`}
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
            {onCopy && <ChatActionButton onClick={onCopy}>Copy</ChatActionButton>}
            {isUser && onEdit && <ChatActionButton onClick={onEdit}>Edit</ChatActionButton>}
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
  onCopy: PropTypes.func,
  onEdit: PropTypes.func,
  onOpenSource: PropTypes.func,
};
