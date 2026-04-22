import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { requireEnv } from "./supabase.ts";

export const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2024-11-20"
});

export const stripeCryptoProvider = Stripe.createSubtleCryptoProvider();
