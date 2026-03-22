import styles from './AnalyzeButton.module.css';

export function AnalyzeButton({ onClick, disabled }) {
  return (
    <button className={styles.btn} onClick={onClick} disabled={disabled}>
      {disabled ? 'Analyzing…' : 'Analyze Today\'s News'}
    </button>
  );
}
