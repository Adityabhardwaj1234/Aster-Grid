import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Check, Copy, Minus, Plus } from 'lucide-react';
import { useState } from 'react';

import { cx } from '../lib/format';
import styles from './Controls.module.css';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  danger?: boolean;
  size?: 'sm' | 'md';
};

export function IconButton({
  label,
  active = false,
  danger = false,
  size = 'md',
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        styles.iconButton,
        size === 'sm' && styles.iconSmall,
        active && styles.iconActive,
        danger && styles.iconDanger,
        className,
      )}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  compact?: boolean;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  compact = false,
}: SegmentedProps<T>) {
  return (
    <div
      className={cx(styles.segmented, compact && styles.segmentedCompact)}
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cx(styles.segment, option.value === value && styles.segmentActive)}
          aria-pressed={option.value === value}
          title={option.title ?? option.label}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, hint, disabled = false }: ToggleProps) {
  return (
    <label className={cx(styles.toggle, disabled && styles.toggleDisabled)}>
      <span className={styles.toggleCopy}>
        <span className={styles.toggleLabel}>{label}</span>
        {hint ? <span className={styles.toggleHint}>{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    </label>
  );
}

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  hint?: string;
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  format,
  hint,
}: RangeFieldProps) {
  const display = format ? format(value) : `${value}${unit ?? ''}`;
  return (
    <label className={styles.range}>
      <span className={styles.rangeHead}>
        <span>{label}</span>
        <span className={styles.rangeValue}>{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          backgroundSize: `${((value - min) / Math.max(1, max - min)) * 100}% 100%`,
        }}
      />
      {hint ? <span className={styles.rangeHint}>{hint}</span> : null}
    </label>
  );
}

interface CounterProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  unit?: string;
}

export function Counter({ label, value, min = 0, max = 12, onChange, unit }: CounterProps) {
  return (
    <div className={styles.counter}>
      <span className={styles.counterLabel}>{label}</span>
      <div className={styles.counterControls}>
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >
          <Minus size={12} strokeWidth={1.8} />
        </button>
        <span className={styles.counterValue}>
          {value}
          {unit ? <small>{unit}</small> : null}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          <Plus size={12} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

interface PanelTitleProps {
  eyebrow?: string;
  title: string;
  id?: string;
  right?: ReactNode;
}

export function PanelTitle({ eyebrow, title, id, right }: PanelTitleProps) {
  return (
    <div className={styles.panelTitle}>
      <div>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        <h2 id={id}>{title}</h2>
      </div>
      {right ? <div className={styles.panelTitleRight}>{right}</div> : null}
    </div>
  );
}

interface StatusPillProps {
  status: string;
  label?: string;
  pulse?: boolean;
}

export function StatusPill({ status, label, pulse = false }: StatusPillProps) {
  return (
    <span className={cx(styles.statusPill, styles[`status_${status}`] ?? styles.status_default)}>
      <span className={cx(styles.statusDot, pulse && styles.statusPulse)} aria-hidden="true" />
      {label ?? status.replace(/_/g, ' ')}
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className={styles.spinner} role="status" aria-label={label}>
      <span />
      <span />
    </span>
  );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={styles.copyButton}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          setCopied(false);
        }
      }}
      title={`${label}: ${value}`}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  return (
    <div className={cx(styles.metric, styles[`metric_${tone}`])}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
      {sub ? <span className={styles.metricSub}>{sub}</span> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      {icon ? <div className={styles.emptyIcon}>{icon}</div> : null}
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
