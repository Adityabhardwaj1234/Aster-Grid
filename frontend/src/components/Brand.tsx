import styles from './Brand.module.css';

interface BrandProps {
  compact?: boolean;
  light?: boolean;
  subtitle?: string;
}

export default function Brand({ compact = false, light = false, subtitle }: BrandProps) {
  return (
    <div className={`${styles.brand} ${compact ? styles.compact : ''} ${light ? styles.light : ''}`}>
      <img src="/brand/astergrid-mark-64.png" alt="" className={styles.mark} />
      <div className={styles.type}>
        <span className={styles.wordmark}>ASTERGRID</span>
        {!compact ? (
          <span className={styles.subtitle}>{subtitle ?? 'Scenario Intelligence'}</span>
        ) : null}
      </div>
    </div>
  );
}
