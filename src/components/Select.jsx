/**
 * Select — the shared dropdown: label, select, hint and error.
 * Looks come from `.ffl-field` / `select.ffl-input` in index.css.
 *
 *   <Select label="Position" value={pos} onChange={e => setPos(e.target.value)}>
 *     <option value="">All positions</option>
 *     <option value="GK">Goalkeeper</option>
 *   </Select>
 *
 * Other props go straight to the <select>. `size="sm"` gives the 36px compact
 * field. Files under LeagueScreen cannot import this (Rolldown TDZ rule): they
 * put className="ffl-input" on a raw <select> instead.
 */
import { useId } from 'react';

export default function Select({
  label,
  error,
  helperText,
  required = false,
  id,
  name,
  size,
  className = '',
  fieldClassName = '',
  fieldStyle,
  children,
  ...rest
}) {
  const autoId = useId();
  const selectId = id || (name ? `f-${name}` : autoId);
  const hasError = Boolean(error);
  const describedBy = hasError ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined;

  return (
    <div className={`ffl-field ${fieldClassName}`} style={fieldStyle}>
      {label && (
        <label htmlFor={selectId} className="ffl-field__label" data-error={hasError || undefined}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        name={name}
        required={required}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
        className={`ffl-input ${size === 'sm' ? 'ffl-input--sm' : ''} ${className}`}
        {...rest}
      >
        {children}
      </select>
      {hasError && <div id={`${selectId}-error`} className="ffl-field__error" role="alert">{error}</div>}
      {helperText && !hasError && <div id={`${selectId}-helper`} className="ffl-field__hint">{helperText}</div>}
    </div>
  );
}
