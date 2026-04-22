import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function requireEnv(name: string) {
    const value = Deno.env.get(name);

    if (!value) {
        throw new Error(`${name} is not set.`);
    }

    return value;
}

export function createServiceClient() {
    return createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );
}

export function createUserClient(authHeader: string) {
    return createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("SUPABASE_ANON_KEY"),
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            },
            global: {
                headers: {
                    Authorization: authHeader
                }
            }
        }
    );
}
