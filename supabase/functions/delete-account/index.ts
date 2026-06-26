// Edge Function: delete-account
//
// Apple App Store Guideline 5.1.1(v): an app that supports account creation
// must let users initiate account deletion from within the app. This function
// is the server side of the Profile → "Delete account" flow.
//
// It authenticates the CALLER from their JWT (so a user can only delete their
// OWN account), then hard-deletes the auth user with the service role. Deleting
// the auth.users row cascades to public.users (profile) and onward to the app
// tables, provided those foreign keys are ON DELETE CASCADE — verify with:
//   SELECT conname, confdeltype FROM pg_constraint
//   WHERE confrelid = 'auth.users'::regclass OR confrelid = 'public.users'::regclass;
// (confdeltype = 'c' means cascade.)
//
// Deploy: supabase functions deploy delete-account
// The SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY env vars are
// injected by the Edge runtime automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ ok: false, error: 'Not authenticated.' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Resolve the caller from their JWT — this is who we are allowed to delete.
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await caller.auth.getUser();
    if (userErr || !user) return json({ ok: false, error: 'Not authenticated.' }, 401);

    // Service-role client performs the privileged delete.
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      return json({ ok: false, error: delErr.message }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : 'Could not delete your account.' },
      500,
    );
  }
});
