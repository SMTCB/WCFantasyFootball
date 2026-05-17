/**
 * TextInput — unified form input with label, error, and helper text.
 *
 * Replaces scattered inline input definitions across AuthScreen, LeagueScreen, AdminSeedScreen.
 * Handles: label positioning, error states, helper text, focus/blur styling, accessibility.
 *
 * Usage:
 *   <TextInput label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
 *   <TextInput label="Password" type="password" error="Passwords do not match" />
 *   <TextInput label="Username" helperText="3-20 characters" disabled />
 *   <TextInput label="Display Name" type="text" required />
 */

import { useState } from 'react';

export default function TextInput({
  label,
  value = '',
  onChange,
  onBlur,
  onFocus,
  type = 'text',
  placeholder,
  error,
  helperText,
  disabled = false,
  required = false,
  name,
  id,
  autoComplete,
  ...rest
}) {
  const [isFocused, setIsFocused] = useState(false);
  const inputId = id || name || label?.toLowerCase().replace(/\s+/g, '-');
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
          htmlFor={inputId}
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

      <input
        id={inputId}
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={hasError}
        aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
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
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.6 : 1,
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
      />

      {error && (
        <div
          id={`${inputId}-error`}
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
          id={`${inputId}-helper`}
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
