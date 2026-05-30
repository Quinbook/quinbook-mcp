import { describe, it, expect } from 'vitest';
import { contactTools } from './contacts.js';
import { ToolContext, ElicitOutcome } from './types.js';

const create = contactTools.find((t) => t.name === 'contacts_create')!;

interface PostCall {
  url: string;
  body: unknown;
}

/** Minimal ApiClient stub that records POSTs (the only call contacts_create makes). */
function makeFakeApi(calls: PostCall[]): any {
  return {
    post: async (url: string, body: unknown) => {
      calls.push({ url, body });
      return { ok: true };
    },
  };
}

/** ctx that elicits, returning a canned outcome and recording the requested schema. */
function elicitCtx(outcome: ElicitOutcome, captured: any[] = []): ToolContext {
  return {
    clientSupportsElicitation: true,
    elicit: async (params) => {
      captured.push(params);
      return outcome;
    },
  };
}

describe('contacts_create identity gate', () => {
  it('blocks with needs_input when no identity field and client cannot elicit', async () => {
    const calls: any[] = [];
    const res: any = await create.handler({}, makeFakeApi(calls), undefined);
    expect(res.status).toBe('needs_input');
    expect(res.missing.map((m: any) => m.field)).toEqual(['firstName', 'lastName', 'emailAddress', 'companyName']);
    expect(calls.length).toBe(0); // nothing written
  });

  it('proceeds when at least one identity field is present', async () => {
    const calls: PostCall[] = [];
    await create.handler({ emailAddress: 'a@b.de' }, makeFakeApi(calls), undefined);
    expect(calls).toEqual([{ url: '/v1/contact', body: { emailAddress: 'a@b.de' } }]);
  });

  it('treats blank-only identity as missing', async () => {
    const calls: any[] = [];
    const res: any = await create.handler({ firstName: '  ', lastName: '' }, makeFakeApi(calls), undefined);
    expect(res.status).toBe('needs_input');
    expect(calls.length).toBe(0);
  });

  it('merges elicited value and writes (optional form, not all-required)', async () => {
    const calls: any[] = [];
    const captured: any[] = [];
    const ctx = elicitCtx({ action: 'accept', content: { lastName: 'Müller' } }, captured);
    await create.handler({}, makeFakeApi(calls), ctx);
    expect(captured[0].requestedSchema.required).toEqual([]); // at-least-one-of → none individually required
    expect(calls).toEqual([{ url: '/v1/contact', body: { lastName: 'Müller' } }]);
  });

  it('cancels when the user dismisses the form', async () => {
    const calls: any[] = [];
    const ctx = elicitCtx({ action: 'cancel' });
    const res: any = await create.handler({}, makeFakeApi(calls), ctx);
    expect(res.status).toBe('cancelled');
    expect(calls.length).toBe(0);
  });

  it('re-gates when the elicited form is accepted empty', async () => {
    const calls: any[] = [];
    const ctx = elicitCtx({ action: 'accept', content: {} });
    const res: any = await create.handler({}, makeFakeApi(calls), ctx);
    expect(res.status).toBe('needs_input');
    expect(calls.length).toBe(0);
  });
});
