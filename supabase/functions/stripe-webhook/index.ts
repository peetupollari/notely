import type Stripe from "https://esm.sh/stripe@14?target=denonext";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { upsertCheckoutSession } from "../_shared/purchases.ts";
import { createServiceClient, requireEnv } from "../_shared/supabase.ts";
import { stripe, stripeCryptoProvider } from "../_shared/stripe.ts";

Deno.serve(async (request) => {
    const corsResponse = handleCors(request);
    if (corsResponse) return corsResponse;

    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed." }, 405);
    }

    const signature = request.headers.get("Stripe-Signature");
    if (!signature) {
        return jsonResponse({ error: "Missing Stripe signature." }, 400);
    }

    const rawBody = await request.text();

    let event: Stripe.Event;

    try {
        event = await stripe.webhooks.constructEventAsync(
            rawBody,
            signature,
            requireEnv("STRIPE_WEBHOOK_SIGNING_SECRET"),
            undefined,
            stripeCryptoProvider
        );
    } catch (error) {
        console.error("Stripe webhook verification failed:", error);
        return jsonResponse({ error: "Invalid Stripe webhook signature." }, 400);
    }

    try {
        const serviceClient = createServiceClient();

        if (
            event.type === "checkout.session.async_payment_failed" ||
            event.type === "checkout.session.async_payment_succeeded" ||
            event.type === "checkout.session.completed"
        ) {
            const session = event.data.object as Stripe.Checkout.Session;
            const paidTimestamp = session.payment_status === "paid"
                ? new Date(event.created * 1000).toISOString()
                : null;

            await upsertCheckoutSession(serviceClient, session, paidTimestamp);
        }

        return jsonResponse({ received: true });
    } catch (error) {
        console.error("Stripe webhook processing failed:", error);
        return jsonResponse({ error: "Stripe webhook processing failed." }, 500);
    }
});
