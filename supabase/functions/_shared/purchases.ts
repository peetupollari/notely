import type Stripe from "https://esm.sh/stripe@14?target=denonext";

function normalizeEmail(value: string | null | undefined) {
    return String(value || "").trim().toLowerCase();
}

function extractId(value: string | Stripe.Customer | Stripe.PaymentIntent | Stripe.PaymentLink | null) {
    if (!value) return null;
    return typeof value === "string" ? value : value.id;
}

export function extractCustomerEmail(session: Stripe.Checkout.Session) {
    const email = normalizeEmail(
        session.customer_details?.email ??
        session.customer_email ??
        null
    );

    if (!email) {
        throw new Error("customer_email_missing");
    }

    return email;
}

export function hasPaidDownloadAccess(session: Stripe.Checkout.Session) {
    return session.payment_status === "paid";
}

export async function upsertCheckoutSession(
    serviceClient: any,
    session: Stripe.Checkout.Session,
    paidAtOverride: string | null = null
) {
    const customerEmail = extractCustomerEmail(session);
    const accessGranted = hasPaidDownloadAccess(session);
    const checkoutCreatedAt = typeof session.created === "number"
        ? new Date(session.created * 1000).toISOString()
        : null;

    const existingPurchase = await serviceClient
        .from("noto_download_purchases")
        .select("paid_at")
        .eq("stripe_checkout_session_id", session.id)
        .maybeSingle();

    if (existingPurchase.error) {
        throw existingPurchase.error;
    }

    const preservedPaidAt = existingPurchase.data?.paid_at ?? null;
    const resolvedPaidAt = accessGranted
        ? (preservedPaidAt || paidAtOverride || new Date().toISOString())
        : null;

    const { error } = await serviceClient
        .from("noto_download_purchases")
        .upsert({
            stripe_checkout_session_id: session.id,
            customer_email: customerEmail,
            stripe_customer_id: extractId(session.customer),
            stripe_payment_intent_id: extractId(session.payment_intent),
            stripe_payment_link_id: extractId(session.payment_link),
            amount_total: session.amount_total ?? null,
            currency: session.currency ?? null,
            checkout_status: session.status ?? "open",
            payment_status: session.payment_status ?? "unpaid",
            has_download_access: accessGranted,
            livemode: Boolean(session.livemode),
            checkout_created_at: checkoutCreatedAt,
            paid_at: resolvedPaidAt,
            raw_checkout_session: session
        });

    if (error) {
        throw error;
    }

    return {
        accessGranted,
        customerEmail,
        paymentStatus: session.payment_status ?? "unpaid"
    };
}
