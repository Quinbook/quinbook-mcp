import { describe, it, expect } from 'vitest';
import { orderWriteTools } from './orders_write.js';
import { ToolContext, ElicitOutcome } from './types.js';

const recordPayment = orderWriteTools.find((t) => t.name === 'orders_record_payment')!;

interface PostCall {
  url: string;
  body: unknown;
}

function makeFakeApi(calls: PostCall[]): any {
  return {
    post: async (url: string, body: unknown) => {
      calls.push({ url, body });
      return { ok: true };
    },
  };
}

function elicitCtx(outcome: ElicitOutcome, captured: any[] = []): ToolContext {
  return {
    clientSupportsElicitation: true,
    elicit: async (params) => {
      captured.push(params);
      return outcome;
    },
  };
}

describe('orders_record_payment gate', () => {
  it('gates with needs_input when amount + handler missing (no elicitation)', async () => {
    const calls: PostCall[] = [];
    const res: any = await recordPayment.handler({ iOrder: 42 }, makeFakeApi(calls), undefined);
    expect(res.status).toBe('needs_input');
    expect(res.missing.map((m: any) => m.field)).toEqual(['amount', 'paymentHandler']);
    expect(calls.length).toBe(0);
  });

  it('gates when only amount is given', async () => {
    const calls: PostCall[] = [];
    const res: any = await recordPayment.handler({ iOrder: 42, amount: 10 }, makeFakeApi(calls), undefined);
    expect(res.status).toBe('needs_input');
    expect(res.missing.map((m: any) => m.field)).toEqual(['paymentHandler']);
    expect(calls.length).toBe(0);
  });

  it('treats blank paymentHandler as missing', async () => {
    const calls: PostCall[] = [];
    const res: any = await recordPayment.handler({ iOrder: 42, amount: 10, paymentHandler: '  ' }, makeFakeApi(calls), undefined);
    expect(res.status).toBe('needs_input');
    expect(calls.length).toBe(0);
  });

  it('writes when both required fields are present', async () => {
    const calls: PostCall[] = [];
    await recordPayment.handler({ iOrder: 42, amount: 25.5, paymentHandler: 'cash' }, makeFakeApi(calls), undefined);
    expect(calls).toEqual([{ url: '/v2/order/42/payments', body: { amount: 25.5, paymentHandler: 'cash' } }]);
  });

  it('elicits missing fields, requires all, then writes', async () => {
    const calls: PostCall[] = [];
    const captured: any[] = [];
    const ctx = elicitCtx({ action: 'accept', content: { amount: 30, paymentHandler: 'transfer' } }, captured);
    await recordPayment.handler({ iOrder: 7 }, makeFakeApi(calls), ctx);
    expect(captured[0].requestedSchema.required).toEqual(['amount', 'paymentHandler']);
    expect(calls).toEqual([{ url: '/v2/order/7/payments', body: { amount: 30, paymentHandler: 'transfer' } }]);
  });

  it('re-gates when elicited form is accepted incomplete', async () => {
    const calls: PostCall[] = [];
    const ctx = elicitCtx({ action: 'accept', content: { amount: 30 } });
    const res: any = await recordPayment.handler({ iOrder: 7 }, makeFakeApi(calls), ctx);
    expect(res.status).toBe('needs_input');
    expect(calls.length).toBe(0);
  });

  it('cancels when the user dismisses the form', async () => {
    const calls: PostCall[] = [];
    const ctx = elicitCtx({ action: 'cancel' });
    const res: any = await recordPayment.handler({ iOrder: 7 }, makeFakeApi(calls), ctx);
    expect(res.status).toBe('cancelled');
    expect(calls.length).toBe(0);
  });
});
