import styles from './ProgressFeed.module.css';

export function ProgressFeed({ messages }) {
  if (!messages.length) return null;
  return (
    <div className={styles.feed}>
      {messages.map((msg, i) => (
        <div key={i} className={styles.line}>
          <span className={styles.bullet}>›</span>
          {msg}
        </div>
      ))}
      <div className={styles.spinner} />
    </div>
  );
}
