/**
 * Automatic mock for @supabase/supabase-js.
 *
 * Jest picks up files in __mocks__/@supabase/ automatically when the test calls
 * jest.mock('@supabase/supabase-js') — no factory function needed, so the
 * out-of-scope variable restriction doesn't apply.
 *
 * The createClient mock returns a shared client whose behaviour is controlled
 * via the exported `__testHarness` object. Tests configure it directly:
 *
 *   import { __testHarness } from '@supabase/supabase-js';
 *   __testHarness.setQueryResult('users', 'select', { data: [...], error: null });
 */

import {
  createSupabaseMock,
  type MockHarness,
} from '../../supabaseMockFactory';

// Singleton harness — shared across the entire test file
export const __testHarness: MockHarness = createSupabaseMock();

export function createClient() {
  return __testHarness.client;
}

// Re-export the harness helpers at the module level for convenience
export const setQueryResult = __testHarness.setQueryResult.bind(__testHarness);
export const setAuthUser = __testHarness.setAuthUser.bind(__testHarness);
export const setRpcResult = __testHarness.setRpcResult.bind(__testHarness);
export const setFunctionResult = __testHarness.setFunctionResult.bind(__testHarness);
export const clearAll = __testHarness.clearAll.bind(__testHarness);
