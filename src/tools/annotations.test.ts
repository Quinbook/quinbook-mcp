import { describe, it, expect } from 'vitest';
import { TokenManager } from '../auth.js';
import { loadConfig } from '../config.js';
import { buildAllTools } from './index.js';

// The Anthropic directory submission requires every tool to carry a human-readable `title`
// plus exactly one safety hint: `readOnlyHint` for reads, or `destructiveHint` for writes.
// Missing annotations are a top cause of rejection — guard the whole tool set here so a newly
// added tool can't silently ship without them.
describe('tool annotations (directory submission contract)', () => {
  const tokens = new TokenManager(loadConfig());
  const tools = buildAllTools(tokens);

  it('registers a non-empty tool set', () => {
    expect(tools.length).toBeGreaterThan(0);
  });

  for (const tool of tools) {
    describe(tool.name, () => {
      it('has annotations with a title', () => {
        expect(tool.annotations, `${tool.name} is missing annotations`).toBeDefined();
        expect(typeof tool.annotations!.title).toBe('string');
        expect(tool.annotations!.title!.length).toBeGreaterThan(0);
      });

      it('declares exactly one of readOnlyHint / destructiveHint intent', () => {
        const a = tool.annotations!;
        const isRead = a.readOnlyHint === true;
        const isWrite = a.readOnlyHint === false;
        // A read tool must not also claim destructive; a write tool must carry an explicit
        // destructiveHint (true or false) so the client knows the side-effect class.
        expect(isRead || isWrite, `${tool.name} must set readOnlyHint`).toBe(true);
        if (isRead) {
          expect(a.destructiveHint ?? false).toBe(false);
        } else {
          expect(typeof a.destructiveHint, `${tool.name} (write) must set destructiveHint`).toBe('boolean');
        }
      });
    });
  }
});
