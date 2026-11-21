/**
 * TextInput — the shared form field: label, input, hint and error.
 * Looks come from `.ffl-field` / `.ffl-input` in index.css.
 *
 *   <TextInput label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
 *   <TextInput label="Password" type="password" error="Passwords do not match" />
 *   <TextInput aria-label="Search players" placeholder="Search" />      // no visible label
 *   <TextInput label="Notes" multiline rows={3} />                       // textarea
 *
 * Other props (required, minLength, autoComplete, maxLength, min, max, step…)
 * go straight to the <input>. `size="sm"` gives the 36px compact field.
 * Files under LeagueScreen cannot import this (Rolldown TDZ rule): they put
 * className="ffl-input" on a raw <input> instead.
 */
import { useId } from 'react';

export default function TextInput({
  label,
  error,
  helperText,
  required = false,
  id,
  name,
  multiline = false,
  size,
  className = '',
  fieldClassName = '',
  fieldStyle,
  ...rest
}) {
  const autoId = useId();
  const inputId = id || (name ? `f-${name}` : autoId);
  const hasError = Boolean(error);
  const describedBy = hasError ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined;
  const Tag = multiline ? 'textarea' : 'input';

  return (
    <div className={`ffl-field ${fieldClassName}`} style={fieldStyle}>
      {label && (
        <label htmlFor={inputId} className="ffl-field__label" data-error={hasError || undefined}>
          {label}
        </label>
      )}
      <Tag
        id={inputId}
        name={name}
        required={required}
        aria-invalid={hasError || undefined}
        aria-describedby={describedBy}
        className={`ffl-input ${size === 'sm' ? 'ffl-input--sm' : ''} ${className}`}
        {...(multiline ? {} : { type: rest.type || 'text' })}
        {...rest}
      />
      {hasError && <div id={`${inputId}-error`} className="ffl-field__error" role="alert">{error}</div>}
      {helperText && !hasError && <div id={`${inputId}-helper`} className="ffl-field__hint">{helperText}</div>}
    </div>
  );
}
