import { handleSubmission } from '@/server/submissions.mjs';

export const runtime = 'nodejs';

export async function POST(request) {
  return handleSubmission(request, 'beta');
}
