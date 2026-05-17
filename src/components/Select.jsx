/**
 * Select — unified dropdown input with label, error, and helper text.
 *
 * Replaces scattered inline select definitions across AuthScreen, LeagueScreen, AdminSeedScreen.
 * Handles: label positioning, error states, helper text, focus/blur styling, accessibility.
 *
 * Usage:
 *   <Select label="Position" value={pos} onChange={(e) => setPos(e.target.value)}>
 *     <option value="">All positions</option>
 *     <option value="GK">Goalkeeper</option>
 *     <option value="DEF">Defender</option>
 *   </Select>
 *
 *   <Select label="Competition" value={comp} onChange={...} error="Required field" required>
 *     <option value="">Select a competition...</option>
 *     {competitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
 *   </Select>
 */

import { useState } from 'react';

export default function Select({
  label,
  value = '',
  onChange,
  onBlur,
  onFocus,
  error,
  helperText,
  disabled = false,
  required = false,
  name,
  id,
  children,
  ...rest
}) {
  const [isFocused, setIsFocused] = useState(false);
  const selectId = id || name || label?.toLowerCase().replace(/\s+/g, '-');
  const hasError = Boolean(error);

  const handleFocus = (e) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label
          htmlFor={selectId}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            color: hasError ? 'var(--danger)' : 'var(--mute)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            display: 'block',
          }}
        >
          {label}
          {required && <span style={{ color: 'var(--danger)' }}> *</span>}
        </label>
      )}

      <select
        id={selectId}
        name={name}
        value={value}
        onChange={onChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        aria-invalid={hasError}
        aria-describedby={error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
        style={{
          width: '100%',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 12,
          color: disabled ? 'var(--mute)' : 'var(--paper)',
          padding: '8px 12px',
          background: disabled ? 'rgba(242, 238, 229, 0.02)' : 'rgba(242, 238, 229, 0.04)',
          border: `1px solid ${hasError ? 'var(--danger)' : 'var(--rule)'}`,
          borderRadius: 4,
          outline: 'none',
          transition: 'all 150ms',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          appearance: 'none',
          paddingRight: '28px',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23f2eee5' d='M1 1l5 5 5-5'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 8px center',
        }}
        onMouseEnter={(e) => {
          if (!disabled && !isFocused) {
            e.currentTarget.style.borderColor = hasError ? 'var(--danger)' : 'rgba(242, 238, 229, 0.08)';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !isFocused) {
            e.currentTarget.style.borderColor = hasError ? 'var(--danger)' : 'var(--rule)';
          }
        }}
        {...rest}
      >
        {children}
      </select>

      {error && (
        <div
          id={`${selectId}-error`}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            color: 'var(--danger)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {error}
        </div>
      )}

      {helperText && !error && (
        <div
          id={`${selectId}-helper`}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            color: 'var(--mute)',
            letterSpacing: '0.05em',
          }}
        >
          {helperText}
        </div>
      )}
    </div>
  );
}
