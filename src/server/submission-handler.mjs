import 'server-only';
import { SubmissionError, validateSubmission } from './validation.mjs';

const MAX_BYTES = 24000;
const reply = (data, status) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

async function readBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new SubmissionError(415, 'Please submit the form as JSON.');
  }
  if (Number(request.headers.get('content-length')) > MAX_BYTES) throw new SubmissionError(413, 'The submission is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new SubmissionError(400, 'The form is empty.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new SubmissionError(413, 'The submission is too large.');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof SubmissionError) throw error;
    throw new SubmissionError(400, 'The form could not be read. Please try again.');
  } finally {
    reader.releaseLock();
  }
}

export function createSubmissionHandler({ getStore, scheduleNotification, getOrigin }) {
  return async (request, type) => {
    try {
      const origin = getOrigin();
      if (!origin) throw new Error('origin_not_configured');
      if (request.headers.get('origin') !== new URL(origin).origin) {
        throw new SubmissionError(403, 'Please submit this form from the LimitPact website.');
      }
      const data = validateSubmission(type, await readBody(request));
      const result = await getStore().accept(data);
      // The commit already succeeded. Scheduling/notification failure must never
      // turn this accepted record into a client error or a duplicate insert.
      try { scheduleNotification(result.id); } catch { console.error('notification_schedule_failed'); }
      return reply({ accepted: true, submissionId: result.id, duplicate: result.duplicate }, result.duplicate ? 200 : 201);
    } catch (error) {
      if (error instanceof SubmissionError) {
        const response = reply({ accepted: false, error: error.message, fields: error.fields }, error.status);
        if (error.status === 429) response.headers.set('Retry-After', '3600');
        return response;
      }
      console.error('submission_persistence_unavailable');
      return reply({ accepted: false, error: 'We could not save your submission. Your details are still here; please try again.' }, 503);
    }
  };
}
