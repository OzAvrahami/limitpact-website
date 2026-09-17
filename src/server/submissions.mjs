import 'server-only';
import { after } from 'next/server';
import { getDatabase } from './database.mjs';
import { createSubmissionStore } from './submission-store.mjs';
import { createSubmissionHandler } from './submission-handler.mjs';
import { sendNotification } from './notifications.mjs';

export const handleSubmission = createSubmissionHandler({
  getStore: () => createSubmissionStore(getDatabase()),
  getOrigin: () => process.env.APP_ORIGIN || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : null),
  scheduleNotification: (id) => after(async () => {
    try { await sendNotification(createSubmissionStore(getDatabase()), id); }
    catch { console.error('notification_processing_failed'); }
  }),
});
