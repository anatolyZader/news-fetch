import { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat.js';
import styles from './ChatPanel.module.css';

export function ChatPanel() {
  const { history, streaming, draft, send } = useChat();
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, draft]);

  function submit(e) {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    send(input.trim());
    setInput('');
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Ask about this report</div>

      <div className={styles.messages}>
        {history.length === 0 && (
          <div className={styles.placeholder}>
            Ask anything about today's resilience assessment…
          </div>
        )}
        {history.map((msg, i) => (
          <div key={i} className={`${styles.msg} ${styles[msg.role]}`}>
            <div className={styles.bubble}>{msg.content}</div>
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
          placeholder="Ask a question…"
          disabled={streaming}
        />
        <button className={styles.sendBtn} type="submit" disabled={streaming || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
