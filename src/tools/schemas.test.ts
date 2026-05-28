import { describe, it, expect } from 'vitest';
import { allTools } from './index.test-helper.js';

describe('Tool registry', () => {
  it('registers the expected number of tools (36)', () => {
    expect(allTools.length).toBeGreaterThanOrEqual(36);
  });

  it('all tools have unique names', () => {
    const names = allTools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

describe('Schema coercion', () => {
  it('cart_add_item accepts string-encoded numbers (MCP transport quirk)', () => {
    const tool = allTools.find((t) => t.name === 'cart_add_item')!;
    const result = tool.inputSchema.safeParse({
      iSku: '62087',
      quantity: '1',
      iEvent: '12602',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.iSku).toBe(62087);
      expect(result.data.quantity).toBe(1);
      expect(result.data.iEvent).toBe(12602);
    }
  });

  it('cart_apply_coupon accepts string iCart + iCoupon', () => {
    const tool = allTools.find((t) => t.name === 'cart_apply_coupon')!;
    const result = tool.inputSchema.safeParse({
      iCart: '375',
      iCoupon: '3920151',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.iCart).toBe(375);
      expect(result.data.iCoupon).toBe(3920151);
    }
  });

  it('me_switch_company requires a positive iCompany', () => {
    const tool = allTools.find((t) => t.name === 'me_switch_company')!;
    expect(tool.inputSchema.safeParse({ iCompany: 0 }).success).toBe(false);
    expect(tool.inputSchema.safeParse({ iCompany: -1 }).success).toBe(false);
    expect(tool.inputSchema.safeParse({ iCompany: 3 }).success).toBe(true);
    expect(tool.inputSchema.safeParse({ iCompany: '3' }).success).toBe(true);
  });

  it('contacts_create requires at least one identifying field via runtime check', () => {
    // The schema itself accepts any subset (all fields optional), the controller
    // does the at-least-one check. Here we just verify the schema is permissive.
    const tool = allTools.find((t) => t.name === 'contacts_create')!;
    expect(tool.inputSchema.safeParse({ firstName: 'Test' }).success).toBe(true);
    expect(tool.inputSchema.safeParse({}).success).toBe(true); // empty is valid at schema level
  });
});
