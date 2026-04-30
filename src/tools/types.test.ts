import { describe, it, expect } from 'vitest';
import { coerceBool, dryRunField, dryRunPreview } from './types.js';

describe('coerceBool', () => {
  const schema = coerceBool();

  it('passes real booleans through', () => {
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(false)).toBe(false);
  });

  it('handles string-encoded booleans (the MCP-transport quirk)', () => {
    expect(schema.parse('true')).toBe(true);
    expect(schema.parse('false')).toBe(false);
    expect(schema.parse('TRUE')).toBe(true);
    expect(schema.parse('False')).toBe(false);
  });

  it('handles "1" / "0" / "yes" / "no" / empty string', () => {
    expect(schema.parse('1')).toBe(true);
    expect(schema.parse('0')).toBe(false);
    expect(schema.parse('yes')).toBe(true);
    expect(schema.parse('no')).toBe(false);
    expect(schema.parse('')).toBe(false);
  });

  it('handles numbers', () => {
    expect(schema.parse(1)).toBe(true);
    expect(schema.parse(0)).toBe(false);
    expect(schema.parse(42)).toBe(true);
  });

  it('does NOT make Boolean("false") === true (the bug we fixed)', () => {
    // Plain z.coerce.boolean() would return true here. Our coerceBool returns false.
    expect(schema.parse('false')).toBe(false);
    expect(schema.parse('false')).not.toBe(true);
  });

  it('rejects truly invalid inputs', () => {
    expect(() => schema.parse({})).toThrow();
    expect(() => schema.parse([])).toThrow();
  });
});

describe('dryRunField', () => {
  it('defaults to true when value is omitted', () => {
    expect(dryRunField.parse(undefined)).toBe(true);
  });

  it('respects explicit false (the original bug we fixed)', () => {
    expect(dryRunField.parse(false)).toBe(false);
    expect(dryRunField.parse('false')).toBe(false);
  });

  it('parses true variants correctly', () => {
    expect(dryRunField.parse(true)).toBe(true);
    expect(dryRunField.parse('true')).toBe(true);
    expect(dryRunField.parse('1')).toBe(true);
  });
});

describe('dryRunPreview', () => {
  it('returns the consistent shape with method, url and body', () => {
    const result = dryRunPreview('POST', '/v2/order/cart/items', { iSku: 1 });
    expect(result).toEqual({
      dryRun: true,
      wouldCall: { method: 'POST', url: '/v2/order/cart/items', body: { iSku: 1 } },
      note: 'No data was changed. Re-run with dryRun=false to execute.',
    });
  });

  it('handles missing body by emitting null', () => {
    const result = dryRunPreview('DELETE', '/v2/order/cart/123');
    expect(result.wouldCall.body).toBeNull();
  });
});
