import 'server-only';

export class SubmissionError extends Error {
  constructor(status, message, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const controlCharacters = /[\u0000-\u001f\u007f]/;

export function validateSubmission(type, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SubmissionError(400, 'Please check the form and try again.');
  }
  if (!['contact', 'beta'].includes(type)) throw new SubmissionError(404, 'Form not found.');
  if (input.website !== undefined && input.website !== '') {
    throw new SubmissionError(400, 'Unable to accept this submission.');
  }
  if (typeof input.idempotencyKey !== 'string' || !UUID.test(input.idempotencyKey)) {
    throw new SubmissionError(400, 'Please reopen the form and try again.');
  }
  const fields = {};
  const name = typeof input.name === 'string' ? input.name.trim().replace(/ +/g, ' ') : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!name || name.length > 100 || controlCharacters.test(name)) fields.name = 'Enter a name of 1 to 100 characters.';
  if (email.length > 254 || !emailPattern.test(email) || controlCharacters.test(email)) fields.email = 'Enter a valid email address.';
  let message = null;
  let platform = null;
  if (type === 'contact') {
    message = typeof input.message === 'string' ? input.message.replace(/\r\n?/g, '\n').trim() : '';
    if (!message || message.length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) {
      fields.message = 'Enter a message of 1 to 5,000 characters.';
    }
  } else {
    platform = typeof input.platform === 'string' ? input.platform.trim() : '';
    if (!['Tradovate', 'NinjaTrader', 'Other'].includes(platform)) fields.platform = 'Choose a listed trading platform.';
  }
  if (Object.keys(fields).length) throw new SubmissionError(422, 'Please check the highlighted fields.', fields);
  return { type, name, email, message, platform, idempotencyKey: input.idempotencyKey.toLowerCase() };
}
