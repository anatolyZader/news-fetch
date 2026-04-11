import { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import styles from './ChatPanel.module.css';

export function ChatPanel() {
  const { history, streaming, draft, send, stop } = useChat();
  const { t } = useLanguage();
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (history.length > 0 || draft) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, draft]);

  function submit(e) {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    send(input.trim());
    setInput('');
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>{t('chat.header')}</div>

      <div className={styles.messages}>
        {history.length === 0 && (
          <div className={styles.placeholder}>
            {t('chat.placeholder')}
          </div>
        )}
        {history.map((msg, i) => (
          <div key={i} className={`${styles.msg} ${styles[msg.role]}`}>
            <div className={`${styles.bubble} ${msg.error ? styles.error : ''}`}>{msg.content}</div>
          </div>
        ))}
        {streaming && draft && (
          <div className={`${styles.msg} ${styles.assistant}`}>
            <div className={styles.bubble}>{draft}<span className={styles.cursor} /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className={styles.form} onSubmit={submit}>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('chat.input')}
          disabled={streaming}
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
