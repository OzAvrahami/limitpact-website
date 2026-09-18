// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import SubmissionForm from '../src/components/ui/SubmissionForm.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function fill(type) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Name'), 'Test Trader');
  await user.type(screen.getByLabelText('Email'), 'trader@example.test');
  if (type === 'contact') await user.type(screen.getByLabelText('Message'), 'Local test only');
  else await user.selectOptions(screen.getByLabelText('Trading platform'), 'NinjaTrader');
  return user;
}

test.each(['contact', 'beta'])('%s waits for durable acceptance and disables duplicate submits', async (type) => {
  let finish;
  const fetchMock = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  vi.stubGlobal('fetch', fetchMock);
  const onSuccess = vi.fn();
  render(<SubmissionForm type={type} onSuccess={onSuccess} />);
  const user = await fill(type);
  await user.click(screen.getByRole('button'));
  expect(screen.getByRole('button')).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Saving');
  expect(onSuccess).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button'));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe(type === 'contact' ? '/api/contact' : '/api/private-beta');
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body).toMatchObject({ name: 'Test Trader', email: 'trader@example.test', website: '' });
  expect(type === 'contact' ? body.message : body.platform).toBe(type === 'contact' ? 'Local test only' : 'NinjaTrader');
  finish(Response.json({ accepted: true, submissionId: 'test-id' }, { status: 201 }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
});

test.each(['contact', 'beta'])('%s preserves values and retry key after network failure', async (type) => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(Response.json({ accepted: true, submissionId: 'same-id' }));
  vi.stubGlobal('fetch', fetchMock);
  const onSuccess = vi.fn();
  render(<SubmissionForm type={type} onSuccess={onSuccess} />);
  const user = await fill(type);
  await user.click(screen.getByRole('button'));
  const error = await screen.findByRole('alert');
  expect(error).toHaveFocus();
  expect(screen.getByLabelText('Name')).toHaveValue('Test Trader');
  expect(screen.getByLabelText('Email')).toHaveValue('trader@example.test');
  expect(onSuccess).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button'));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
});

test('server validation errors are accessible; changed fields use a new attempt key', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ accepted: false, error: 'Check your name.', fields: { name: 'Enter a name.' } }, { status: 422 }));
  vi.stubGlobal('fetch', fetchMock);
  const onSuccess = vi.fn();
  render(<SubmissionForm type="contact" onSuccess={onSuccess} />);
  const user = await fill('contact');
  await user.click(screen.getByRole('button'));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Enter a name.');
  await user.type(screen.getByLabelText('Name'), ' updated');
  fetchMock.mockResolvedValueOnce(Response.json({ accepted: true, submissionId: 'new-id' }));
  await user.click(screen.getByRole('button'));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).idempotencyKey).not.toBe(JSON.parse(fetchMock.mock.calls[1][1].body).idempotencyKey);
});

test.each([
  [503, { accepted: false, error: 'Could not save.' }],
  [200, { accepted: false }], [200, { accepted: true }],
])('HTTP %s without a valid acceptance cannot show success', async (status, body) => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(body, { status })));
  const onSuccess = vi.fn();
  render(<SubmissionForm type="contact" onSuccess={onSuccess} />);
  const user = await fill('contact');
  await user.click(screen.getByRole('button'));
  await screen.findByRole('alert');
  expect(onSuccess).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Message')).toHaveValue('Local test only');
});

test('closing a pending form cannot trigger success in a subsequently opened modal', async () => {
  let finish;
  vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { finish = resolve; })));
  const onSuccess = vi.fn();
  const view = render(<SubmissionForm type="contact" onSuccess={onSuccess} />);
  const user = await fill('contact');
  await user.click(screen.getByRole('button'));
  view.unmount();
  finish(Response.json({ accepted: true, submissionId: 'test-id' }));
  await waitFor(() => expect(onSuccess).not.toHaveBeenCalled());
});
