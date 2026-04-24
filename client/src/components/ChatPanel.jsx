import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChat } from '../hooks/useChat.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import styles from './ChatPanel.module.css';

export function ChatPanel({ reportScope }) {
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
    send,
    regenerateLast,
    stop,
    deleteMessage,
  } = useChat();
  const { t } = useLanguage();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef(null);
  const composerRef = useRef(null);
  const menuWrapRef = useRef(null);
  const menuBtnRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const historyBtnRef = useRef(null);
  const [historyPos, setHistoryPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (history.length > 0 || draft) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, draft]);

  useEffect(() => {
    function onDocMouseDown(e) {
      const wrap = menuWrapRef.current;
      if (wrap?.contains(e.target)) return;
      if (menuOpen) setMenuOpen(false);
      if (historyOpen) setHistoryOpen(false);
    }

    function onDocKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (menuOpen) setMenuOpen(false);
      if (searchOpen) setSearchOpen(false);
      if (historyOpen) setHistoryOpen(false);
    }

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, [menuOpen, searchOpen, historyOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const btn = menuBtnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    // Align menu's top-right to button's bottom-right
    setMenuPos({
      top: Math.round(r.bottom + 8),
      left: Math.round(r.right),
    });
  }, [menuOpen]);

  useEffect(() => {
    if (!historyOpen) return;
    const btn = historyBtnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setHistoryPos({
      top: Math.round(r.bottom + 8),
      left: Math.round(r.left),
    });
  }, [historyOpen]);

  useEffect(() => {
    // Auto-grow textarea (ChatGPT-style)
    const el = composerRef.current;
    if (!el) return;
    el.style.height = '0px';
    const next = Math.min(el.scrollHeight, 120);
    el.style.height = `${next}px`;
  }, [input]);

  const visibleHistory = useMemo(() => {
    const q = String(search ?? '').trim().toLowerCase();
    if (!q) return history;
    return history.filter((m) => String(m.content ?? '').toLowerCase().includes(q));
  }, [history, search]);

  function submit(e) {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    send(input.trim(), { scope: reportScope ?? { type: 'all' } });
    setInput('');
  }

  function onComposerKeyDown(e) {
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return; // newline
    e.preventDefault();
    // Submit on Enter
    submit(e);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.menuWrapCorner} ref={menuWrapRef}>
          <button
            type="button"
            className={styles.historyBtn}
            onClick={() => setHistoryOpen((v) => !v)}
            aria-label="History"
            title="History"
            ref={historyBtnRef}
          >
            History
          </button>
        </div>
        <div className={styles.headerGrow} />
        <div className={styles.menuWrapCorner} ref={menuWrapRef}>
          <button
            type="button"
            className={styles.menuIconBtn}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
            title="Menu"
            ref={menuBtnRef}
          >
            ⋯
          </button>
        </div>
      </div>

      {historyOpen && createPortal(
        <div
          className={styles.historyMenu}
          role="menu"
          aria-label="Chat history"
          style={{ position: 'fixed', top: `${historyPos.top}px`, left: `${historyPos.left}px` }}
        >
          {sessions.length === 0 && (
            <div className={styles.historyEmpty}>No past chats yet</div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`${styles.historyItem} ${s.id === activeSessionId ? styles.historyItemActive : ''}`}
              role="menuitem"
              onClick={() => {
                setActiveSessionId(s.id);
                setHistoryOpen(false);
              }}
              title={s.title?.trim() ? s.title.trim() : 'Untitled'}
            >
              {s.title?.trim() ? s.title.trim() : 'Untitled'}
            </button>
          ))}
        </div>,
        document.body
      )}

      {menuOpen && createPortal(
        <div
          className={styles.menu}
          role="menu"
          aria-label="Chat menu"
          style={{ position: 'fixed', top: `${menuPos.top}px`, left: `${menuPos.left}px`, transform: 'translateX(-100%)' }}
        >
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => {
              setSearchOpen((v) => !v);
              setMenuOpen(false);
            }}
          >
            {searchOpen ? 'Hide search' : 'Search'}
          </button>
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => {
              const sel = window.getSelection?.()?.toString?.() ?? '';
              const text = String(sel).trim();
              if (!text) return;
              const quoted = text.split('\n').map((l) => `> ${l}`).join('\n');
              setInput((prev) => (prev ? `${prev}\n\n${quoted}` : quoted));
              setMenuOpen(false);
            }}
          >
            Quote selection
          </button>
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            disabled={!activeSessionId || streaming}
            onClick={async () => {
              await regenerateLast();
              setMenuOpen(false);
            }}
          >
            Retry
          </button>
          <div className={styles.menuDivider} role="separator" />
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            onClick={async () => {
              await createSession({ title: '' });
              setMenuOpen(false);
            }}
          >
            New chat
          </button>
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            disabled={!activeSessionId}
            onClick={async () => {
              if (!activeSessionId) return;
              const current = sessions.find((s) => s.id === activeSessionId)?.title ?? '';
              const next = window.prompt('Rename chat', current);
              if (next == null) return;
              await renameSession({ sessionId: activeSessionId, title: next });
              setMenuOpen(false);
            }}
          >
            Rename chat
          </button>
          <button
            type="button"
            className={styles.menuItemDanger}
            role="menuitem"
            disabled={!activeSessionId}
            onClick={async () => {
              if (!activeSessionId) return;
              const ok = window.confirm('Delete this chat?');
              if (!ok) return;
              await deleteSession({ sessionId: activeSessionId });
              setMenuOpen(false);
            }}
          >
            Delete chat
          </button>
        </div>,
        document.body
      )}

      <div className={styles.messages}>
        {history.length === 0 && (
          <div className={styles.placeholder}>
            {t('chat.placeholder')}
          </div>
        )}
        {visibleHistory.map((msg, i) => (
          <div key={i} className={`${styles.row} ${styles[msg.role]}`}>
            <div className={styles.avatar} aria-hidden="true">
              {msg.role === 'user' ? 'You' : 'AI'}
            </div>
            <div className={`${styles.bubble} ${msg.error ? styles.error : ''}`}>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => navigator.clipboard?.writeText(msg.content ?? '')}
                  title="Copy"
                >
                  Copy
                </button>
                {msg.role === 'user' && (
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => setInput(msg.content ?? '')}
                    title="Edit"
                  >
                    Edit
                  </button>
                )}
                {msg.id && activeSessionId && (
                  <button
                    type="button"
                    className={styles.actionBtnDanger}
                    onClick={async () => {
                      const ok = window.confirm('Delete this message?');
                      if (!ok) return;
                      await deleteMessage({ sessionId: activeSessionId, messageId: msg.id });
                    }}
                    title="Delete"
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className={styles.content}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content ?? ''}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {streaming && draft && (
          <div className={`${styles.row} ${styles.assistant}`}>
            <div className={styles.avatar} aria-hidden="true">AI</div>
            <div className={styles.bubble}>
              <div className={styles.content}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {draft ?? ''}
                </ReactMarkdown>
                <span className={styles.cursor} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {searchOpen && (
        <div className={styles.searchPopover} role="dialog" aria-label="Search chat">
          <input
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search in chat…"
            aria-label="Search in chat"
            autoFocus
          />
          <button
            type="button"
            className={styles.searchClose}
            onClick={() => setSearchOpen(false)}
            aria-label="Close search"
            title="Close search"
          >
            Close
          </button>
        </div>
      )}

      <form className={styles.form} onSubmit={submit}>
        <textarea
          className={styles.composer}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={t('chat.input')}
          disabled={streaming}
          rows={1}
          ref={composerRef}
        />
        {streaming ? (
          <button className={styles.stopBtn} type="button" onClick={stop}>
            {t('chat.stop') ?? 'Stop'}
          </button>
        ) : (
          <button className={styles.sendBtn} type="submit" disabled={!input.trim()}>
            {t('chat.send')}
          </button>
        )}
      </form>
    </div>
  );
}
