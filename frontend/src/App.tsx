import { useEffect, useRef } from 'react';

import CommandCenter from './components/CommandCenter';
import LaunchScreen from './components/LaunchScreen';
import { useAppStore } from './store/useAppStore';
import styles from './App.module.css';

function BootScreen({ error }: { error?: string | null }) {
  return (
    <main className={styles.boot}>
      <div className={styles.bootScan} aria-hidden="true" />
      <div className={styles.bootMark}>
        <img src="/brand/astergrid-mark.png" alt="" />
        <span className={styles.bootRing} aria-hidden="true" />
      </div>
      <p className="eyebrow">ASTERGRID / LOCAL COMMAND</p>
      <h1>{error ? 'Command link unavailable' : 'Initializing terrain lattice'}</h1>
      <p className={styles.bootMessage}>
        {error ??
          'Binding the deterministic world service, agent graph, and event ledger.'}
      </p>
      {error ? (
        <button
          type="button"
          className={styles.retry}
          onClick={() => window.location.reload()}
        >
          Retry connection
        </button>
      ) : (
        <div className={styles.bootProgress} aria-label="Loading application">
          <span />
        </div>
      )}
    </main>
  );
}

export default function App() {
  const bootState = useAppStore((state) => state.bootState);
  const bootError = useAppStore((state) => state.bootError);
  const screen = useAppStore((state) => state.screen);
  const initialize = useAppStore((state) => state.initialize);
  const loadRun = useAppStore((state) => state.loadRun);
  const toast = useAppStore((state) => state.toast);
  const setToast = useAppStore((state) => state.setToast);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (bootState !== 'ready' || screen !== 'launch') return;
    const runId = new URLSearchParams(window.location.search).get('run');
    if (runId) void loadRun(runId);
  }, [bootState, loadRun, screen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4800);
    return () => window.clearTimeout(timer);
  }, [setToast, toast]);

  if (bootState === 'loading' || bootState === 'idle') {
    return <BootScreen />;
  }
  if (bootState === 'error') {
    return <BootScreen error={bootError} />;
  }

  return (
    <>
      {screen === 'launch' ? <LaunchScreen /> : <CommandCenter />}
      <div className={styles.toastWrap} aria-live="polite" aria-atomic="true">
        {toast ? (
          <button type="button" className={styles.toast} onClick={() => setToast(null)}>
            <span className={styles.toastSignal} aria-hidden="true" />
            <span>{toast}</span>
            <span className={styles.toastClose} aria-hidden="true">
              ×
            </span>
          </button>
        ) : null}
      </div>
    </>
  );
}
