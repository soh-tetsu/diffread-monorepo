import { createClient } from "@supabase/supabase-js";

type ClientOptions = {
  key?: string;
  schema?: string;
};

function resolveSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  );
}

function resolveServiceKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  );
}

function createSupabaseInstance(opts: ClientOptions = {}) {
  const url = resolveSupabaseUrl();
  const key = opts.key ?? resolveServiceKey();
  const schema = opts.schema ?? process.env.SUPABASE_DB_SCHEMA ?? "api";

  if (!url) {
    throw new Error("Missing Supabase URL. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!key) {
    throw new Error(
      "Missing Supabase service key. Set SUPABASE_SERVICE_ROLE_KEY (preferred) or another SUPABASE_* key."
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema,
    },
  });
}

export const supabase = createSupabaseInstance();
export const createSupabaseClient = createSupabaseInstance;
