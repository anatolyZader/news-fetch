import { useLanguage } from '../context/LanguageContext.jsx';
import styles from './LanguageSelector.module.css';

const LANGS = ['en', 'he', 'ru'];

export function LanguageSelector() {
  const { lang, setLang, t } = useLanguage();

  return (
    <div className={styles.selector}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          className={`${styles.btn} ${lang === l ? styles.active : ''}`}
          onClick={() => setLang(l)}
        >
          {t(`lang.${l}`)}
        </button>
      ))}
    </div>
  );
}
