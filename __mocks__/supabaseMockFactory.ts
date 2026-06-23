/**
 * Reusable Supabase mock harness for BasisRide Jest tests.
 *
 * Creates a fully chainable mock client that mirrors the supabase-js v2 API
 * shape: from(table).select(...).eq(...).single() etc., all returning
 * { data, error } tuples. No real network calls are made.
 *
 * RLS simulation:
 *   Policy decisions are encoded as mock return values. A policy denial is
 *   represented as { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } }
 *   or an empty array { data: [], error: null } for SELECT denials.
 *   This matches real supabase-js behaviour under RLS.
 */

export type SupabaseResult<T = unknown> = { data: T | null; error: { message: string; code?: string } | null };

// Standard RLS denial shapes matching real supabase-js error objects
export const RLS_DENY_WRITE: SupabaseResult = {
  data: null,
  error: { message: 'new row violates row-level security policy', code: '42501' },
};
export const RLS_DENY_SELECT: SupabaseResult = {
  data: [],
  error: null,
};
export const RLS_DENY_UPDATE: SupabaseResult = {
  data: null,
  error: { message: 'new row violates row-level security policy', code: '42501' },
};
export const NOT_AUTHENTICATED: SupabaseResult = {
  data: null,
  error: { message: 'JWT expired', code: 'PGRST301' },
};
export const CHECK_VIOLATION = (detail: string): SupabaseResult => ({
  data: null,
  error: { message: `new row for relation violates check constraint: ${detail}`, code: '23514' },
});
export const UNIQUE_VIOLATION = (detail: string): SupabaseResult => ({
  data: null,
  error: { message: `duplicate key value violates unique constraint: ${detail}`, code: '23505' },
});

/** Per-table, per-operation result map. Key format: `table:op` e.g. `users:select` */
type ResultMap = Map<string, SupabaseResult>;

export interface MockSupabaseClient {
  from: jest.Mock;
  rpc: jest.Mock;
  auth: {
    getSession: jest.Mock;
    signInWithPassword: jest.Mock;
    signOut: jest.Mock;
    onAuthStateChange: jest.Mock;
    startAutoRefresh: jest.Mock;
    stopAutoRefresh: jest.Mock;
  };
  functions: { invoke: jest.Mock };
  channel: jest.Mock;
  removeChannel: jest.Mock;
}

export interface MockHarness {
  client: MockSupabaseClient;
  /** Set the result for a specific table + operation (select/insert/update/delete/upsert) */
  setQueryResult: (table: string, op: string, result: SupabaseResult) => void;
  /** Set the authenticated user context for getSession() */
  setAuthUser: (user: { id: string; email: string } | null) => void;
  /** Set the result for a named RPC call */
  setRpcResult: (rpcName: string, result: SupabaseResult) => void;
  /** Set the result for a named Edge Function call */
  setFunctionResult: (fnName: string, result: { data: unknown; error: unknown }) => void;
  /** Reset all mocks and results */
  clearAll: () => void;
}

export function createSupabaseMock(): MockHarness {
  const resultMap: ResultMap = new Map();
  const rpcResults: Map<string, SupabaseResult> = new Map();
  const fnResults: Map<string, { data: unknown; error: unknown }> = new Map();
  let currentUser: { id: string; email: string } | null = null;

  function getResult(table: string, op: string): SupabaseResult {
    const key = `${table}:${op}`;
    return resultMap.get(key) ?? { data: null, error: { message: `No mock configured for ${key}` } };
  }

  /** Builds a chainable query builder for a given table + operation. */
  function buildChain(table: string, op: string) {
    let pendingOp = op;
    let resolvedResult: SupabaseResult | null = null;

    const resolve = (): SupabaseResult => {
      if (resolvedResult) return resolvedResult;
      resolvedResult = getResult(table, pendingOp);
      return resolvedResult;
    };

    // Terminal: convert array data to single item
    const singleFrom = (arr: unknown[], orNull: boolean): SupabaseResult => {
      if (arr.length > 0) return { data: arr[0], error: null };
      if (orNull) return { data: null, error: null };
      return {
        data: null,
        error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
      };
    };

    const chain: Record<string, jest.Mock> = {};

    chain.select = jest.fn().mockReturnValue(chain);
    chain.insert = jest.fn().mockImplementation(() => { pendingOp = 'insert'; return chain; });
    chain.update = jest.fn().mockImplementation(() => { pendingOp = 'update'; return chain; });
    chain.delete = jest.fn().mockImplementation(() => { pendingOp = 'delete'; return chain; });
    chain.upsert = jest.fn().mockImplementation(() => { pendingOp = 'upsert'; return chain; });
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.neq = jest.fn().mockReturnValue(chain);
    chain.in = jest.fn().mockReturnValue(chain);
    chain.or = jest.fn().mockReturnValue(chain);
    chain.is = jest.fn().mockReturnValue(chain);
    chain.order = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.filter = jest.fn().mockReturnValue(chain);
    chain.match = jest.fn().mockReturnValue(chain);
    chain.not = jest.fn().mockReturnValue(chain);
    chain.gt = jest.fn().mockReturnValue(chain);
    chain.lt = jest.fn().mockReturnValue(chain);
    chain.gte = jest.fn().mockReturnValue(chain);
    chain.lte = jest.fn().mockReturnValue(chain);

    chain.single = jest.fn().mockImplementation(() => {
      const r = resolve();
      if (r.error) return Promise.resolve(r);
      const arr = Array.isArray(r.data) ? (r.data as unknown[]) : [r.data];
      return Promise.resolve(singleFrom(arr, false));
    });

    chain.maybeSingle = jest.fn().mockImplementation(() => {
      const r = resolve();
      if (r.error) return Promise.resolve(r);
      const arr = Array.isArray(r.data) ? (r.data as unknown[]) : [r.data];
      return Promise.resolve(singleFrom(arr, true));
    });

    // Make the chain thenable so `await supabase.from('x').select('*')` resolves
    chain.then = jest.fn().mockImplementation((onFulfilled: (v: SupabaseResult) => unknown) => {
      return Promise.resolve(resolve()).then(onFulfilled);
    });

    return chain;
  }

  const mockFrom = jest.fn().mockImplementation((table: string) => buildChain(table, 'select'));

  const mockRpc = jest.fn().mockImplementation((name: string) => {
    return Promise.resolve(
      rpcResults.get(name) ?? { data: null, error: { message: `No mock for rpc:${name}` } },
    );
  });

  const mockAuth = {
    getSession: jest.fn().mockImplementation(() =>
      Promise.resolve({ data: { session: currentUser ? { user: currentUser } : null }, error: null }),
    ),
    signInWithPassword: jest.fn().mockResolvedValue({
      data: { session: { user: currentUser } },
      error: null,
    }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: jest.fn().mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    }),
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
  };

  const mockFunctions = {
    invoke: jest.fn().mockImplementation((name: string) => {
      return Promise.resolve(
        fnResults.get(name) ?? { data: { ok: true }, error: null },
      );
    }),
  };

  const mockChannel = jest.fn().mockReturnValue({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
  });
  const mockRemoveChannel = jest.fn().mockResolvedValue(undefined);

  const client: MockSupabaseClient = {
    from: mockFrom,
    rpc: mockRpc,
    auth: mockAuth,
    functions: mockFunctions,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  };

  const harness: MockHarness = {
    client,
    setQueryResult(table: string, op: string, result: SupabaseResult) {
      resultMap.set(`${table}:${op}`, result);
    },
    setAuthUser(user: { id: string; email: string } | null) {
      currentUser = user;
      mockAuth.getSession.mockImplementation(() =>
        Promise.resolve({ data: { session: user ? { user } : null }, error: null }),
      );
    },
    setRpcResult(rpcName: string, result: SupabaseResult) {
      rpcResults.set(rpcName, result);
    },
    setFunctionResult(fnName: string, result: { data: unknown; error: unknown }) {
      fnResults.set(fnName, result);
    },
    clearAll() {
      resultMap.clear();
      rpcResults.clear();
      fnResults.clear();
      currentUser = null;
      jest.clearAllMocks();
      // Restore getSession mock after clearAllMocks resets it
      mockAuth.getSession.mockImplementation(() =>
        Promise.resolve({ data: { session: null }, error: null }),
      );
    },
  };

  return harness;
}

// Singleton for use by the automatic @supabase/supabase-js mock
export const __testHarness: MockHarness = createSupabaseMock();
