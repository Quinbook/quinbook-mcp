import { describe, it, expect } from 'vitest';
import { coerceBool } from './types.js';

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
