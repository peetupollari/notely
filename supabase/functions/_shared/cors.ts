export const corsHeaders = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
};

export function handleCors(request: Request) {
    if (request.method !== "OPTIONS") return null;
    return new Response("ok", { headers: corsHeaders });
}

export function jsonResponse(body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: corsHeaders
    });
}
