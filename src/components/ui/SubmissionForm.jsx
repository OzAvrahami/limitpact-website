"use client";

import { useEffect, useRef, useState } from 'react';

export default function SubmissionForm({ type, onSuccess }) {
  const isBeta = type === 'beta';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const attempt = useRef(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const errorRef = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const snapshot = JSON.stringify(values);
    if (attempt.current?.snapshot !== snapshot) {
      attempt.current = { snapshot, key: crypto.randomUUID() };
    }
    submitting.current = true;
    setPending(true);
    setError('');
    setFields({});
    try {
      const response = await fetch(isBeta ? '/api/private-beta' : '/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, idempotencyKey: attempt.current.key }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json();
      if (!mounted.current) return;
      if (!response.ok || body.accepted !== true || typeof body.submissionId !== 'string') {
        setFields(body.fields ?? {});
        setError(body.error || 'We could not confirm your submission. Please try again.');
        return;
      }
      onSuccess();
    } catch {
      if (mounted.current) setError('We could not confirm your submission. Your details are still here; please try again.');
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  }

  function fieldProps(name) {
    return { id: `${type}-${name}`, name, 'aria-invalid': fields[name] ? true : undefined,
      'aria-describedby': fields[name] ? `${type}-${name}-error` : undefined };
  }

  return (
    <form className="modalForm" onSubmit={submit} aria-busy={pending}>
      <div className="formIntro">
        <h3 id="modal-title">{isBeta ? 'Join the private beta' : 'Contact LimitPact'}</h3>
        <p>{isBeta ? "Tell us where you trade and we'll be in touch. No account is created yet." : 'For traders and integration partners alike. We read every message.'}</p>
      </div>
      <fieldset className="formFields" disabled={pending}>
        <legend className="srOnly">{isBeta ? 'Private beta registration' : 'Contact details'}</legend>
        <Field label="Name" id={`${type}-name`} error={fields.name}>
          <input {...fieldProps('name')} required maxLength={100} autoComplete="name" placeholder="Your name" />
        </Field>
        <Field label="Email" id={`${type}-email`} error={fields.email}>
          <input {...fieldProps('email')} required type="email" maxLength={254} autoComplete="email" placeholder="you@example.com" />
        </Field>
        {isBeta ? (
          <Field label="Trading platform" id="beta-platform" error={fields.platform}>
            <select {...fieldProps('platform')} defaultValue="Tradovate">
              <option>Tradovate</option><option>NinjaTrader</option><option>Other</option>
            </select>
          </Field>
        ) : (
          <Field label="Message" id="contact-message" error={fields.message}>
            <textarea {...fieldProps('message')} required maxLength={5000} rows="4" placeholder="How can we help?" />
          </Field>
        )}
        <div className="formHoney" aria-hidden="true">
          <label htmlFor={`${type}-website`}>Leave this field empty</label>
          <input id={`${type}-website`} name="website" tabIndex={-1} autoComplete="off" />
        </div>
      </fieldset>
      {error && <p className="formError" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
      <p className="srOnly" role="status">{pending ? 'Saving your submission.' : ''}</p>
      <button className="button buttonPrimary formSubmit" type="submit" disabled={pending}>
        {pending ? 'Sending...' : isBeta ? 'Request beta access' : 'Send message'}
      </button>
    </form>
  );
}

function Field({ label, id, error, children }) {
  return (
    <div className="formField">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && <span className="formError" id={`${id}-error`}>{error}</span>}
    </div>
  );
}
