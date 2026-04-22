import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { upsertCheckoutSession } from "../_shared/purchases.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { stripe } from "../_shared/stripe.ts";

Deno.serve(async (request) => {
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;

    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
    }

    try {
        const { sessionId } = await request.json();
        const normalizedSessionId = String(sessionId || "").trim();

        if (!normalizedSessionId.startsWith("cs_")) {
            return jsonResponse({ error: "A valid Stripe Checkout Session ID is required." }, 400);
        }

        let session;

        try {
            session = await stripe.checkout.sessions.retrieve(normalizedSessionId);
        } catch (error) {
            console.error("Stripe checkout session lookup failed:", error);
            return jsonResponse({ error: "Stripe session not found." }, 404);
        }

        const serviceClient = createServiceClient();
        const summary = await upsertCheckoutSession(serviceClient, session);

        return jsonResponse({
            accessGranted: summary.accessGranted,
            checkoutStatus: session.status ?? "open",
            paymentStatus: summary.paymentStatus
        });
    } catch (error) {
        console.error("stripe-sync-session failed:", error);
        return jsonResponse({ error: "Stripe payment verification failed." }, 500);
    }
});
