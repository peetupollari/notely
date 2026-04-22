# Noto Paid Download Setup

This repo now includes a Stripe-gated download flow for `noto.html` and `noto-download.html`.

## What changed

- Landing page buy buttons now point to a Stripe payment link from `noto-download-config.js`.
- `noto-download.html` is the gated download page.
- Stripe payments are written into Supabase by:
  - `supabase/functions/stripe-webhook`
  - `supabase/functions/stripe-sync-session`
- The real installer is served through `supabase/functions/create-download-link`.
- The installer must live in a private Supabase Storage bucket, not on a public GitHub release URL.

## 1. Set the public site config

Edit `noto-download-config.js` and set:

```js
window.NOTO_DOWNLOAD_GATE_CONFIG = {
    siteUrl: "https://www.notely.uk",
    downloadPagePath: "/noto-download.html",
    stripePaymentLink: "https://buy.stripe.com/YOUR_PAYMENT_LINK",
    supportEmail: "support@notely.uk"
};
```

Use your real site URL if it is different.

## 2. Run the Supabase SQL

Run the SQL in `supabase/noto-paid-download.sql` inside the Supabase SQL editor.

That script:

- creates `public.noto_download_purchases`
- creates `public.get_my_noto_download_access()`
- creates the private `noto-downloads` storage bucket

## 3. Configure Supabase Auth

In Supabase:

- Turn on `Auth > Providers > Email`
- Allow magic-link sign-in
- Add your download page URL to `Auth > URL Configuration`

Exact redirect URL to allow:

```text
https://www.notely.uk/noto-download.html
```

Also add your local URL if you test locally through a web server, for example:

```text
http://127.0.0.1:5500/noto-download.html
```

## 4. Set Edge Function secrets

Set these Supabase secrets:

```text
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SIGNING_SECRET=whsec_...
NOTO_DOWNLOAD_BUCKET=noto-downloads
NOTO_DOWNLOAD_OBJECT_PATH=windows/Noto-Setup-x64.exe
```

Example CLI command:

```powershell
supabase secrets set `
  STRIPE_SECRET_KEY=sk_live_... `
  STRIPE_WEBHOOK_SIGNING_SECRET=whsec_... `
  NOTO_DOWNLOAD_BUCKET=noto-downloads `
  NOTO_DOWNLOAD_OBJECT_PATH=windows/Noto-Setup-x64.exe
```

## 5. Deploy the Edge Functions

From the repo root:

```powershell
supabase functions deploy stripe-webhook
supabase functions deploy stripe-sync-session
supabase functions deploy create-download-link
```

Because `supabase/config.toml` is included, the two Stripe-facing functions will be public and `create-download-link` will stay protected.

## 6. Configure Stripe

Create or edit your Stripe payment link so that:

- Stripe collects the customer email
- After payment, Stripe redirects to:

```text
https://www.notely.uk/noto-download.html?session_id={CHECKOUT_SESSION_ID}
```

Add a webhook endpoint in Stripe:

```text
https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
```

Subscribe the webhook to these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

## 7. Upload the installer privately

Do not rely on the public GitHub release asset anymore if you want the download gate to matter.

Upload the Windows installer to the private Supabase bucket:

```powershell
$env:SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
.\scripts\upload-noto-installer.ps1 -FilePath "C:\path\to\Noto-Setup-x64.exe"
```

The default private object path is:

```text
noto-downloads/windows/Noto-Setup-x64.exe
```

## 8. Important cleanup

If you keep publishing the installer at a public GitHub release URL, anyone who knows that URL can still download it.

To make the payment gate real, do both:

- stop linking the public GitHub release asset anywhere
- move your actual downloadable installer into the private Supabase bucket

## 9. Test the flow end-to-end

Recommended test:

1. Put a Stripe test payment link in `noto-download-config.js`
2. Buy from `noto.html`
3. Let Stripe redirect you to `noto-download.html?session_id=...`
4. Enter the same email from Stripe
5. Open the magic link
6. Confirm the official Windows download button appears
7. Click it and make sure the installer downloads

## Files involved

- `noto.html`
- `noto.css`
- `noto.js`
- `noto-download.html`
- `noto-download.css`
- `noto-download.js`
- `noto-download-config.js`
- `supabase/noto-paid-download.sql`
- `supabase/config.toml`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/functions/stripe-sync-session/index.ts`
- `supabase/functions/create-download-link/index.ts`
- `scripts/upload-noto-installer.ps1`
