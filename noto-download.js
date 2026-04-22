document.addEventListener("DOMContentLoaded", async () => {
    const SUPABASE_URL = "https://hrsjiejhvrlfjuzbxzgv.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhyc2ppZWpodnJsZmp1emJ4emd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NzM0MDksImV4cCI6MjA4NzM0OTQwOX0.5G1nKpGhtUnF9fQr2bOIKgJMG8BDX8OFsiIMKYTEORY";
    const config = window.NOTO_DOWNLOAD_GATE_CONFIG ?? {};
    const CANONICAL_DOWNLOAD_URL = getCanonicalDownloadUrl(config);
    const FUNCTIONS_BASE_URL = `${SUPABASE_URL}/functions/v1`;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (shouldForceCanonicalCallbackRedirect(CANONICAL_DOWNLOAD_URL)) {
        window.location.replace(buildCanonicalCallbackUrl(CANONICAL_DOWNLOAD_URL));
        return;
    }

    const elements = {
        accessPanel: document.getElementById("download-access-panel"),
        accessStatus: document.getElementById("download-access-status"),
        authCopy: document.getElementById("download-auth-copy"),
        authForm: document.getElementById("download-auth-form"),
        authInput: document.getElementById("download-auth-email"),
        authPanel: document.getElementById("download-auth-panel"),
        authStatus: document.getElementById("download-auth-status"),
        authSubmit: document.getElementById("download-auth-submit"),
        buyLinks: Array.from(document.querySelectorAll("[data-buy-link]")),
        downloadButton: document.getElementById("official-download-button"),
        loaderCopy: document.querySelector("#download-loader-panel .download-panel-copy"),
        loaderPanel: document.getElementById("download-loader-panel"),
        lockedCopy: document.getElementById("download-locked-copy"),
        lockedPanel: document.getElementById("download-locked-panel"),
        lockedSignOut: document.getElementById("download-locked-signout"),
        lockedStatus: document.getElementById("download-locked-status"),
        ownerEmail: document.getElementById("download-owner-email"),
        refreshButton: document.getElementById("download-refresh-button"),
        sessionBanner: document.getElementById("download-session-banner"),
        sessionMessage: document.getElementById("download-session-message"),
        signOut: document.getElementById("download-signout"),
        supportLink: document.getElementById("download-support-link")
    };

    configureSupportLink(elements.supportLink, config.supportEmail);
    configureBuyLinks(elements.buyLinks, config.stripePaymentLink);

    if (!window.supabase) {
        showAuthPanel();
        setStatus(elements.authStatus, "Supabase is not available on this page right now.", "error");
        return;
    }

    const { createClient } = window.supabase;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const defaultDownloadButtonContent = elements.downloadButton instanceof HTMLButtonElement
        ? elements.downloadButton.innerHTML
        : "";

    let accessLoadToken = 0;
    let sessionSyncSummary = { accessGranted: false, fromStripe: false, paymentStatus: "" };

    if (elements.authForm instanceof HTMLFormElement) {
        elements.authForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const email = normalizeEmail(elements.authInput?.value ?? "");
            if (!emailPattern.test(email)) {
                setStatus(elements.authStatus, "Enter a valid email address.", "error");
                return;
            }

            elements.authSubmit.textContent = "Sending...";
            setStatus(elements.authStatus, "");

            try {
                await sendMagicLink(supabase, email, CANONICAL_DOWNLOAD_URL);
                setStatus(elements.authStatus, "Magic link sent. Open it from that inbox to unlock the download.", "success");
            } catch (error) {
                console.error("Download magic link request failed:", error);
                setStatus(elements.authStatus, describeMagicLinkError(error), "error");
            } finally {
                elements.authSubmit.textContent = "Send magic link";
            }
        });
    }

    if (elements.signOut instanceof HTMLButtonElement) {
        elements.signOut.addEventListener("click", async () => {
            accessLoadToken += 1;
            await supabase.auth.signOut();
            showAuthPanel("You have been logged out. Sign in with the email you used in Stripe.", "info");
        });
    }

    if (elements.lockedSignOut instanceof HTMLButtonElement) {
        elements.lockedSignOut.addEventListener("click", async () => {
            accessLoadToken += 1;
            await supabase.auth.signOut();
            showAuthPanel("Try the email you used during Stripe checkout.", "info");
        });
    }

    if (elements.refreshButton instanceof HTMLButtonElement) {
        elements.refreshButton.addEventListener("click", async () => {
            const {
                data: { session }
            } = await supabase.auth.getSession();

            if (!session) {
                showAuthPanel("Your login expired. Sign in again to continue.", "error");
                return;
            }

            await loadCurrentAccess(session);
        });
    }

    if (elements.downloadButton instanceof HTMLButtonElement) {
        elements.downloadButton.addEventListener("click", async () => {
            const {
                data: { session }
            } = await supabase.auth.getSession();

            if (!session) {
                showAuthPanel("Your login expired. Sign in again to continue.", "error");
                return;
            }

            elements.downloadButton.disabled = true;
            elements.downloadButton.innerHTML = "Preparing secure download...";
            setStatus(elements.accessStatus, "Creating a short-lived official download link...", "info");

            try {
                const payload = await invokeFunction(`${FUNCTIONS_BASE_URL}/create-download-link`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                        "Content-Type": "application/json",
                        apikey: SUPABASE_ANON_KEY
                    },
                    body: JSON.stringify({})
                });

                if (!payload?.url) {
                    throw new Error("The secure download link was missing from the response.");
                }

                setStatus(elements.accessStatus, "Your download is starting now.", "success");
                window.location.assign(payload.url);
            } catch (error) {
                console.error("Secure download link request failed:", error);
                setStatus(elements.accessStatus, describeDownloadError(error), "error");
            } finally {
                elements.downloadButton.disabled = false;
                elements.downloadButton.innerHTML = defaultDownloadButtonContent;
            }
        });
    }

    sessionSyncSummary = await syncStripeCheckoutSession();

    supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
            void loadCurrentAccess(session);
        }
    });

    const {
        data: { session }
    } = await supabase.auth.getSession();

    if (session) {
        await loadCurrentAccess(session);
        return;
    }

    showAuthPanel();

    async function syncStripeCheckoutSession() {
        const sessionId = normalizeCheckoutSessionId(new URLSearchParams(window.location.search).get("session_id"));
        if (!sessionId) {
            setSessionBanner("Pay with Stripe, then come back here and sign in with that same email to unlock the official download.", "info");
            return { accessGranted: false, fromStripe: false, paymentStatus: "" };
        }

        setSessionBanner("Checking your Stripe checkout now...", "info");

        try {
            const payload = await invokeFunction(`${FUNCTIONS_BASE_URL}/stripe-sync-session`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: SUPABASE_ANON_KEY
                },
                body: JSON.stringify({ sessionId })
            });

            if (payload?.accessGranted) {
                setSessionBanner("Payment confirmed. Sign in with the same Stripe email to unlock the official download.", "success");
            } else if (String(payload?.paymentStatus || "").toLowerCase() === "processing") {
                setSessionBanner("Your checkout exists, but Stripe still shows the payment as processing. Sign in again after Stripe settles it.", "info");
            } else {
                setSessionBanner("We found your Stripe checkout. Sign in with the same email to continue.", "info");
            }

            stripCheckoutSessionIdFromUrl();

            return {
                accessGranted: Boolean(payload?.accessGranted),
                fromStripe: true,
                paymentStatus: String(payload?.paymentStatus || "")
            };
        } catch (error) {
            console.error("Stripe session sync failed:", error);
            setSessionBanner(describeSessionSyncError(error), "error");
            return { accessGranted: false, fromStripe: true, paymentStatus: "" };
        }
    }

    async function loadCurrentAccess(session) {
        const currentToken = accessLoadToken + 1;
        accessLoadToken = currentToken;
        showLoader("Checking your paid download access...");

        const userEmail = normalizeEmail(session?.user?.email ?? "");
        if (!userEmail) {
            if (currentToken !== accessLoadToken) return;
            showAuthPanel("We could not read your login email. Open the magic link again and try once more.", "error");
            return;
        }

        try {
            const { data, error } = await supabase.rpc("get_my_noto_download_access");

            if (currentToken !== accessLoadToken) return;
            if (error) throw error;

            const access = unwrapSingleRow(data);
            if (access?.has_access) {
                showAccessPanel(userEmail, access.paid_at ?? null);
                return;
            }

            showLockedPanel(userEmail);
        } catch (error) {
            console.error("Paid access lookup failed:", error);
            if (currentToken !== accessLoadToken) return;
            showAuthPanel(describeAccessError(error), "error");
        }
    }

    function showAuthPanel(message = "", tone = "info") {
        showOnlyPanel(elements.authPanel);

        if (elements.authCopy instanceof HTMLElement) {
            elements.authCopy.textContent = sessionSyncSummary.accessGranted
                ? "Stripe has already marked the checkout as paid. Sign in with the same email you used there and we will unlock the official download."
                : "Use the same email you entered during Stripe checkout. We will send a magic link there.";
        }

        setStatus(elements.authStatus, message, tone);
        setStatus(elements.accessStatus, "");
        setStatus(elements.lockedStatus, "");
    }

    function showAccessPanel(email, paidAt = null) {
        showOnlyPanel(elements.accessPanel);

        if (elements.ownerEmail instanceof HTMLElement) {
            elements.ownerEmail.textContent = email;
        }

        if (paidAt) {
            setStatus(elements.accessStatus, `Paid access confirmed ${formatTimestamp(paidAt)}.`, "success");
            return;
        }

        setStatus(elements.accessStatus, "Paid access confirmed. Your secure download button is ready.", "success");
    }

    function showLockedPanel(email) {
        showOnlyPanel(elements.lockedPanel);

        if (elements.lockedCopy instanceof HTMLElement) {
            elements.lockedCopy.textContent = sessionSyncSummary.accessGranted
                ? `Signed in as ${email}, but Stripe already confirmed a paid checkout. This usually means you signed in with a different email than the one used in Stripe.`
                : `Signed in as ${email}, but we could not match this email to a paid Stripe checkout yet. If you paid with another email, sign out and try that one instead.`;
        }

        setStatus(elements.lockedStatus, sessionSyncSummary.accessGranted
            ? "Try the email used during Stripe checkout."
            : "Buy Noto first or sign in with the email used in Stripe.", "info");
    }

    function showLoader(message = "Checking your access...") {
        if (elements.loaderCopy instanceof HTMLElement) {
            elements.loaderCopy.textContent = message;
        }

        showOnlyPanel(elements.loaderPanel);
    }

    function showOnlyPanel(activePanel) {
        [elements.accessPanel, elements.authPanel, elements.loaderPanel, elements.lockedPanel].forEach((panel) => {
            if (!(panel instanceof HTMLElement)) return;
            panel.hidden = panel !== activePanel;
        });
    }

    function setSessionBanner(message, tone = "info") {
        if (!(elements.sessionBanner instanceof HTMLElement) || !(elements.sessionMessage instanceof HTMLElement)) return;

        elements.sessionBanner.hidden = false;
        elements.sessionBanner.classList.remove("error", "success", "info");
        elements.sessionBanner.classList.add(tone);
        elements.sessionMessage.textContent = message;
    }
});

function configureBuyLinks(links, stripePaymentLink) {
    const paymentLink = String(stripePaymentLink || "").trim();
    const hasStripePaymentLink = /^https:\/\/(?:buy|checkout)\.stripe\.com\//i.test(paymentLink);

    links.forEach((link) => {
        if (!(link instanceof HTMLAnchorElement)) return;

        if (hasStripePaymentLink) {
            link.href = paymentLink;
            link.target = "_blank";
            link.rel = "noopener";
            link.removeAttribute("aria-disabled");
            link.style.pointerEvents = "";
            return;
        }

        link.href = "#";
        link.setAttribute("aria-disabled", "true");
        link.style.pointerEvents = "none";
        link.style.opacity = "0.58";
    });
}

function configureSupportLink(linkElement, supportEmail) {
    if (!(linkElement instanceof HTMLAnchorElement)) return;

    const normalizedEmail = String(supportEmail || "").trim() || "support@notely.uk";
    linkElement.href = `mailto:${normalizedEmail}`;
    linkElement.textContent = normalizedEmail;
}

async function sendMagicLink(supabase, email, canonicalDownloadUrl) {
    const requestOptions = {
        shouldCreateUser: true
    };
    const redirectUrl = getMagicLinkRedirectUrl(canonicalDownloadUrl);

    if (redirectUrl) {
        requestOptions.emailRedirectTo = redirectUrl;
    }

    let { error } = await supabase.auth.signInWithOtp({
        email,
        options: requestOptions
    });

    if (error && shouldRetryMagicLinkWithoutRedirect(error)) {
        ({ error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true
            }
        }));
    }

    if (error) throw error;
}

async function invokeFunction(url, options) {
    const response = await fetch(url, options);
    const rawBody = await response.text();

    let payload = {};

    if (rawBody) {
        try {
            payload = JSON.parse(rawBody);
        } catch (_error) {
            payload = { error: rawBody };
        }
    }

    if (!response.ok) {
        throw new Error(String(payload?.error || payload?.message || `Request failed with status ${response.status}.`));
    }

    return payload;
}

function setStatus(statusElement, message, tone = "info") {
    if (!(statusElement instanceof HTMLElement)) return;

    statusElement.textContent = message;
    statusElement.classList.remove("error", "success", "info");

    if (message) {
        statusElement.classList.add(tone);
    }
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeCheckoutSessionId(value) {
    const cleanValue = String(value || "").trim();
    return cleanValue.startsWith("cs_") ? cleanValue : "";
}

function unwrapSingleRow(data) {
    if (Array.isArray(data)) return data[0] ?? null;
    return data ?? null;
}

function getCanonicalDownloadUrl(config = {}) {
    const configuredBaseUrl = String(config.siteUrl || "").trim();
    const configuredPath = String(config.downloadPagePath || "").trim() || "/noto-download.html";

    if (configuredBaseUrl) {
        try {
            return new URL(configuredPath, configuredBaseUrl).toString();
        } catch (error) {
            console.error("Invalid configured download page URL:", error);
        }
    }

    return "https://www.notely.uk/noto-download.html";
}

function getMagicLinkRedirectUrl(baseUrl = "") {
    const redirectUrl = resolveCanonicalUrl(baseUrl);
    redirectUrl.search = "";
    redirectUrl.hash = "";
    return redirectUrl.toString();
}

function shouldForceCanonicalCallbackRedirect(baseUrl = "") {
    const host = String(window.location.hostname || "").toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1") return false;

    const callbackPayload = `${window.location.search}${window.location.hash}`.toLowerCase();
    return (
        callbackPayload.includes("access_token=") ||
        callbackPayload.includes("refresh_token=") ||
        callbackPayload.includes("token_hash=") ||
        callbackPayload.includes("type=") ||
        callbackPayload.includes("error_code=")
    );
}

function buildCanonicalCallbackUrl(baseUrl = "") {
    const redirectUrl = resolveCanonicalUrl(baseUrl);
    redirectUrl.search = window.location.search;
    redirectUrl.hash = window.location.hash;
    return redirectUrl.toString();
}

function resolveCanonicalUrl(baseUrl = "") {
    if (baseUrl) {
        try {
            return new URL(baseUrl);
        } catch (error) {
            console.error("Invalid canonical URL:", error);
        }
    }

    const protocol = window.location.protocol;
    if (protocol === "http:" || protocol === "https:") {
        return new URL(window.location.href);
    }

    return new URL("https://www.notely.uk/noto-download.html");
}

function shouldRetryMagicLinkWithoutRedirect(error) {
    const message = String(error?.message || "").toLowerCase();
    return (
        message.includes("redirect") ||
        message.includes("redirect_to") ||
        message.includes("not allowed") ||
        message.includes("site url") ||
        message.includes("invalid url")
    );
}

function stripCheckoutSessionIdFromUrl() {
    const url = new URL(window.location.href);

    if (!url.searchParams.has("session_id")) return;

    url.searchParams.delete("session_id");
    const replacementUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, document.title, replacementUrl);
}

function formatTimestamp(value) {
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) return "recently";

    return parsedDate.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

function describeMagicLinkError(error) {
    const message = String(error?.message || "");
    const lowerMessage = message.toLowerCase();

    if (!message) return "We could not send the magic link. Please try again.";
    if (lowerMessage.includes("signups not allowed")) {
        return "Supabase auth is blocking new email users. Turn on Auth > Providers > Email and allow new users, then try again.";
    }
    if (lowerMessage.includes("email logins are disabled") || lowerMessage.includes("unsupported provider: provider is not enabled")) {
        return "Supabase email login is disabled right now. Turn on Auth > Providers > Email.";
    }
    if (lowerMessage.includes("redirect") || lowerMessage.includes("redirect_to") || lowerMessage.includes("not allowed")) {
        return "This download page URL is not allowed in Supabase Auth redirect settings. Add it in Supabase Auth > URL Configuration.";
    }
    if (lowerMessage.includes("security purposes")) {
        return "You just requested a login email. Supabase usually makes you wait about 60 seconds before sending another one.";
    }
    if (lowerMessage.includes("smtp")) {
        return "Supabase could not send the login email. Check your email provider or SMTP settings in Supabase Auth.";
    }

    return `We could not send the magic link: ${message}`;
}

function describeSessionSyncError(error) {
    const message = String(error?.message || "").toLowerCase();

    if (!message) return "We could not verify your Stripe checkout right now.";
    if (message.includes("session") && message.includes("not found")) {
        return "We could not find that Stripe checkout session. Finish the payment first, then come back here from the Stripe redirect.";
    }
    if (message.includes("stripe")) {
        return "Stripe verification failed right now. Give it a moment and try the download page again.";
    }

    return "We could not verify your Stripe checkout right now.";
}

function describeAccessError(error) {
    const message = String(error?.message || "").toLowerCase();

    if (!message) return "We could not check your paid access right now.";
    if (message.includes("get_my_noto_download_access")) {
        return "Supabase is missing the paid-download access function. Run the new SQL script first.";
    }
    if (message.includes("noto_download_purchases")) {
        return "The paid-download table is missing in Supabase. Run the new SQL script first.";
    }
    if (message.includes("email_required")) {
        return "We could not read your login email. Open the magic link again and try once more.";
    }

    return "We could not check your paid access right now.";
}

function describeDownloadError(error) {
    const message = String(error?.message || "").toLowerCase();

    if (!message) return "We could not create the secure download link right now.";
    if (message.includes("not_authorized") || message.includes("auth")) {
        return "Your login expired. Sign in again to continue.";
    }
    if (message.includes("no_paid_access")) {
        return "This email does not have paid download access yet.";
    }
    if (message.includes("download asset")) {
        return "The private installer is not configured yet. Upload the app file to the private storage bucket first.";
    }

    return "We could not create the secure download link right now.";
}
