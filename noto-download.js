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
        authCopy: document.getElementById("download-auth-copy"),
        authForm: document.getElementById("download-auth-form"),
        authInput: document.getElementById("download-auth-email"),
        authPanel: document.getElementById("download-auth-panel"),
        authStatus: document.getElementById("download-auth-status"),
        authSubmit: document.getElementById("download-auth-submit"),
        confirmedCopy: document.getElementById("download-confirmed-copy"),
        confirmedPanel: document.getElementById("download-confirmed-panel"),
        confirmedStatus: document.getElementById("download-confirmed-status"),
        downloadButton: document.getElementById("official-download-button"),
        signOut: document.getElementById("download-signout"),
    };

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
            setStatus(elements.confirmedStatus, "Creating a short-lived official download link...", "info");

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

                setStatus(elements.confirmedStatus, "Your download is starting now.", "success");
                window.location.assign(payload.url);
            } catch (error) {
                console.error("Secure download link request failed:", error);
                setStatus(elements.confirmedStatus, describeDownloadError(error), "error");
            } finally {
                elements.downloadButton.disabled = false;
                elements.downloadButton.innerHTML = defaultDownloadButtonContent;
            }
        });
    }

    supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
            void loadCurrentAccess(session);
        } else {
            showAuthPanel();
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

    async function loadCurrentAccess(session) {
        const currentToken = accessLoadToken + 1;
        accessLoadToken = currentToken;

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
                showConfirmedPanel(userEmail, access.paid_at ?? null);
                return;
            }

            // No access, sign them out and show auth panel
            await supabase.auth.signOut();
            showAuthPanel("This email does not have paid download access. Please use the email you used during Stripe checkout.", "error");
        } catch (error) {
            console.error("Paid access lookup failed:", error);
            if (currentToken !== accessLoadToken) return;
            await supabase.auth.signOut();
            showAuthPanel("Error checking access. Please try signing in again.", "error");
        }
    }

    function showAuthPanel(message = "", tone = "info") {
        showOnlyPanel(elements.authPanel);
        setStatus(elements.authStatus, message, tone);
    }

    function showConfirmedPanel(email, paidAt = null) {
        showOnlyPanel(elements.confirmedPanel);
        
        if (paidAt) {
            setStatus(elements.confirmedStatus, `Signed in as ${email}. Paid access confirmed ${formatTimestamp(paidAt)}.`, "success");
            return;
        }

        setStatus(elements.confirmedStatus, `Signed in as ${email}. Your download is ready.`, "success");
    }

    function showOnlyPanel(activePanel) {
        [elements.authPanel, elements.confirmedPanel].forEach((panel) => {
            if (!(panel instanceof HTMLElement)) return;
            panel.hidden = panel !== activePanel;
        });
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
