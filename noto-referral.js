document.addEventListener("DOMContentLoaded", async () => {
    initReferralDust();

    const SUPABASE_URL = "https://hrsjiejhvrlfjuzbxzgv.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhyc2ppZWpodnJsZmp1emJ4emd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NzM0MDksImV4cCI6MjA4NzM0OTQwOX0.5G1nKpGhtUnF9fQr2bOIKgJMG8BDX8OFsiIMKYTEORY";
    const CANONICAL_REFERRAL_URL = "https://www.notely.uk/noto-referral.html";
    const FIREBASE_CONFIG = window.NOTO_FIREBASE_CONFIG ?? null;
    const FIREBASE_COLLECTION = window.NOTO_FIREBASE_COLLECTION || "waitlist_referrals";
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (shouldForceCanonicalCallbackRedirect()) {
        window.location.replace(buildCanonicalCallbackUrl(CANONICAL_REFERRAL_URL));
        return;
    }

    const elements = {
        authForm: document.getElementById("referral-auth-form"),
        authInput: document.getElementById("referral-auth-email"),
        authPanel: document.getElementById("referral-auth-panel"),
        authStatus: document.getElementById("referral-auth-status"),
        authSubmit: document.getElementById("referral-auth-submit"),
        copyButton: document.getElementById("referral-copy-button"),
        count: document.getElementById("referral-count"),
        guestCopy: document.getElementById("referral-guest-copy"),
        guestForm: document.getElementById("referral-guest-form"),
        guestInput: document.getElementById("referral-guest-email"),
        guestPanel: document.getElementById("referral-guest-panel"),
        guestStatus: document.getElementById("referral-guest-status"),
        guestSubmit: document.getElementById("referral-guest-submit"),
        linkInput: document.getElementById("referral-link"),
        loaderPanel: document.getElementById("referral-loader-panel"),
        authCopy: document.getElementById("referral-auth-copy"),
        ownerEmail: document.getElementById("referral-owner-email"),
        ownerPanel: document.getElementById("referral-owner-panel"),
        ownerStatus: document.getElementById("referral-owner-status"),
        result: document.getElementById("referral-result"),
        shell: document.getElementById("referral-shell"),
        signOut: document.getElementById("referral-signout")
    };

    const referralCode = normalizeReferralCode(new URLSearchParams(window.location.search).get("ref"));
    const configMissing =
        SUPABASE_URL.includes("YOUR_SUPABASE_URL") ||
        SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");

    let firebaseRuntimePromise = null;
    let ownerLoadToken = 0;

    setPageMode(referralCode ? "guest" : "auth");
    showOnlyPanel(referralCode ? elements.guestPanel : elements.authPanel);

    if (!window.supabase || configMissing) {
        const targetStatus = referralCode ? elements.guestStatus : elements.authStatus;
        setStatus(targetStatus, "Referral page is not configured yet.", "error");
        return;
    }

    const { createClient } = window.supabase;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const ensureWaitlistEmailExists = async (email) => {
        const { data, error } = await supabase.rpc("waitlist_email_exists", {
            check_email: email
        });

        if (error) throw error;
        return Boolean(data);
    };

    const syncFirebaseReferralSummary = async (summary) => {
        const userId = summary?.user_id ?? summary?.referrer_user_id ?? null;
        if (!userId) return;

        const runtime = await loadFirebaseRuntime();
        if (!runtime) return;

        const payload = {
            email: summary.email ?? summary.referrer_email ?? null,
            referralCode: summary.referral_code ?? summary.applied_referral_code ?? null,
            referralCount: Number(summary.referral_count ?? 0),
            updatedAt: runtime.serverTimestamp(),
            userId
        };

        await runtime.setDoc(
            runtime.doc(runtime.database, FIREBASE_COLLECTION, userId),
            payload,
            { merge: true }
        );
    };

    const loadOwnerReferral = async (session) => {
        const userEmail = normalizeEmail(session?.user?.email ?? "");
        if (!userEmail) {
            showAuthPanel("We could not read your login email. Please try again.", "error");
            return;
        }

        const currentToken = ownerLoadToken + 1;
        ownerLoadToken = currentToken;

        const existingProfile = await findExistingReferral(session.user?.id);
        if (currentToken !== ownerLoadToken) return;

        if (existingProfile) {
            renderOwnerReferral(existingProfile, userEmail);
            return;
        }

        showLoaderScreen();
        setStatus(elements.ownerStatus, "");

        const [result] = await Promise.all([
            supabase.rpc("get_or_create_my_referral"),
            delay(1000)
        ]);

        if (currentToken !== ownerLoadToken) return;

        const profile = unwrapSingleRow(result.data);
        if (result.error || !profile) {
            console.error("Referral profile fetch failed:", result.error);

            if (String(result.error?.message || "").includes("waitlist_email_required")) {
                await supabase.auth.signOut();
                showAuthPanel("That email is not on the waitlist yet. Join the waitlist first.", "error");
                return;
            }

            showOnlyPanel(elements.ownerPanel);
            elements.linkInput.value = "";
            setReferralCount(0);
            elements.copyButton.disabled = true;
            setStatus(elements.ownerStatus, describeReferralError(result.error), "error");
            return;
        }

        renderOwnerReferral(profile, userEmail);
        await syncFirebaseReferralSummary(profile).catch((error) => {
            console.error("Firebase referral sync failed:", error);
        });
    };

    const findExistingReferral = async (userId) => {
        if (!userId) return null;

        const { data, error } = await supabase
            .from("waitlist_referrals")
            .select("user_id, email, referral_code, referral_count")
            .eq("user_id", userId)
            .maybeSingle();

        if (error) {
            console.error("Existing referral lookup failed:", error);
            return null;
        }

        return data ?? null;
    };

    const sendMagicLink = async (email) => {
        const requestOptions = {
            shouldCreateUser: true
        };
        const redirectUrl = getMagicLinkRedirectUrl(CANONICAL_REFERRAL_URL);

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
    };

    const handleGuestJoin = async (email) => {
        const { data, error } = await supabase.rpc("join_waitlist_with_referral", {
            referral_code: referralCode,
            waitlist_email: email
        });

        if (error) throw error;

        const result = unwrapSingleRow(data);
        if (!result) {
            throw new Error("Missing referral signup result.");
        }

        if (result.already_joined) {
            setStatus(elements.guestStatus, "That email is already on the waitlist.", "info");
            return;
        }

        elements.guestForm.reset();
        setStatus(
            elements.guestStatus,
            result.referral_applied
                ? "You are on the waitlist and the referral was counted."
                : "You are on the waitlist. We will email you when Noto is ready.",
            "success"
        );

        await syncFirebaseReferralSummary(result).catch((syncError) => {
            console.error("Firebase referral sync failed:", syncError);
        });
    };

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
                const exists = await ensureWaitlistEmailExists(email);
                if (!exists) {
                    setStatus(elements.authStatus, "That email is not on the waitlist yet. Join the waitlist first.", "error");
                    return;
                }

                await sendMagicLink(email);
                setStatus(elements.authStatus, "Magic link sent. Open it from that email to log in.", "info");
            } catch (error) {
                console.error("Magic link request failed:", error);
                setStatus(elements.authStatus, describeMagicLinkError(error), "error");
            } finally {
                elements.authSubmit.textContent = "Send magic link";
            }
        });
    }

    if (elements.guestForm instanceof HTMLFormElement) {
        elements.guestForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const email = normalizeEmail(elements.guestInput?.value ?? "");
            if (!emailPattern.test(email)) {
                setStatus(elements.guestStatus, "Enter a valid email address.", "error");
                return;
            }

            elements.guestSubmit.textContent = "Joining...";
            setStatus(elements.guestStatus, "");

            try {
                await handleGuestJoin(email);
            } catch (error) {
                console.error("Referral waitlist join failed:", error);
                setStatus(elements.guestStatus, describeWaitlistJoinError(error), "error");
            } finally {
                elements.guestSubmit.textContent = "Join waitlist";
            }
        });
    }

    if (elements.copyButton instanceof HTMLButtonElement) {
        elements.copyButton.addEventListener("click", async () => {
            const referralLink = elements.linkInput?.value ?? "";
            if (!referralLink) return;

            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(referralLink);
                } else {
                    elements.linkInput.focus();
                    elements.linkInput.select();
                    document.execCommand("copy");
                }

                setStatus(elements.ownerStatus, "Referral link copied.", "success");
            } catch (error) {
                console.error("Clipboard copy failed:", error);
                setStatus(elements.ownerStatus, "We could not copy the link automatically.", "error");
            }
        });
    }

    if (elements.signOut instanceof HTMLButtonElement) {
        elements.signOut.addEventListener("click", async () => {
            ownerLoadToken += 1;
            await supabase.auth.signOut();
            showAuthPanel("You have been logged out.", "info");
        });
    }

    if (!referralCode) {
        supabase.auth.onAuthStateChange((_event, session) => {
            if (session) {
                void loadOwnerReferral(session);
                return;
            }

            showAuthPanel();
        });
    }

    const {
        data: { session }
    } = await supabase.auth.getSession();

    if (referralCode) {
        showOnlyPanel(elements.guestPanel);
        return;
    }

    if (session) {
        await loadOwnerReferral(session);
        return;
    }

    showAuthPanel();

    function showAuthPanel(message = "", tone = "info") {
        ownerLoadToken += 1;
        showOnlyPanel(elements.authPanel);
        elements.linkInput.value = "";
        elements.ownerEmail.textContent = "";
        setReferralCount(0);
        elements.copyButton.disabled = true;
        setStatus(elements.ownerStatus, "");
        setStatus(elements.authStatus, message, tone);
    }

    function showOnlyPanel(activePanel) {
        if (elements.loaderPanel instanceof HTMLElement) {
            elements.loaderPanel.hidden = true;
        }
        if (elements.shell instanceof HTMLElement) {
            elements.shell.hidden = false;
        }
        [elements.authPanel, elements.ownerPanel, elements.guestPanel].forEach((panel) => {
            if (!(panel instanceof HTMLElement)) return;
            panel.hidden = panel !== activePanel;
        });
    }

    function showLoaderScreen() {
        if (elements.shell instanceof HTMLElement) {
            elements.shell.hidden = true;
        }
        if (elements.loaderPanel instanceof HTMLElement) {
            elements.loaderPanel.hidden = false;
        }
    }

    function renderOwnerReferral(profile, fallbackEmail = "") {
        showOnlyPanel(elements.ownerPanel);
        elements.ownerEmail.textContent = profile.email || fallbackEmail;
        elements.linkInput.value = buildReferralLink(profile.referral_code, CANONICAL_REFERRAL_URL);
        setReferralCount(profile.referral_count);
        elements.copyButton.disabled = false;
        setStatus(elements.ownerStatus, "");
    }

    function setReferralCount(count) {
        if (elements.count instanceof HTMLElement) {
            elements.count.textContent = formatReferralCount(count);
        }
    }

    function setPageMode(mode) {
        if (mode === "guest") {
            if (elements.authCopy instanceof HTMLElement) {
                elements.authCopy.textContent = "We will send you a magic link.";
            }
            elements.guestCopy.textContent = "Use the email you want on the waitlist.";
            return;
        }

        if (elements.authCopy instanceof HTMLElement) {
            elements.authCopy.textContent = "We will send you a magic link.";
        }
    }

    async function loadFirebaseRuntime() {
        if (!FIREBASE_CONFIG?.apiKey || !FIREBASE_CONFIG?.projectId) return null;

        if (!firebaseRuntimePromise) {
            firebaseRuntimePromise = Promise.all([
                import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js"),
                import("https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js")
            ]).then(([appModule, firestoreModule]) => {
                const app = appModule.getApps().length
                    ? appModule.getApps()[0]
                    : appModule.initializeApp(FIREBASE_CONFIG);

                return {
                    database: firestoreModule.getFirestore(app),
                    doc: firestoreModule.doc,
                    serverTimestamp: firestoreModule.serverTimestamp,
                    setDoc: firestoreModule.setDoc
                };
            }).catch((error) => {
                console.error("Firebase SDK load failed:", error);
                return null;
            });
        }

        return firebaseRuntimePromise;
    }
});

function setStatus(statusElement, message, tone = "info") {
    if (!(statusElement instanceof HTMLElement)) return;

    statusElement.textContent = message;
    statusElement.classList.remove("error", "success", "info", "visible");

    if (!message) return;

    statusElement.classList.add("visible", tone);
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeReferralCode(value) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
}

function unwrapSingleRow(data) {
    if (Array.isArray(data)) return data[0] ?? null;
    return data ?? null;
}

function delay(milliseconds) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, milliseconds);
    });
}

function buildReferralLink(referralCode, baseUrl = "") {
    const cleanUrl = resolveCanonicalUrl(baseUrl);
    cleanUrl.search = "";
    cleanUrl.hash = "";
    return `${cleanUrl.toString()}?ref=${referralCode}`;
}

function formatReferralCount(count) {
    const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    const label = safeCount.toLocaleString();
    return safeCount === 1 ? `${label} referral` : `${label} referrals`;
}

function getMagicLinkRedirectUrl(baseUrl = "") {
    const redirectUrl = resolveCanonicalUrl(baseUrl);
    redirectUrl.search = "";
    redirectUrl.hash = "";
    return redirectUrl.toString();
}

function shouldForceCanonicalCallbackRedirect() {
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

    return new URL("https://www.notely.uk/noto-referral.html");
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
        return "This page URL is not allowed in Supabase Auth redirect settings. Add this referral page URL in Supabase Auth > URL Configuration.";
    }
    if (lowerMessage.includes("security purposes")) {
        return "You just requested a login email. Supabase usually makes you wait about 60 seconds before sending another one.";
    }
    if (lowerMessage.includes("smtp")) {
        return "Supabase could not send the email. Check your email provider or SMTP settings in Supabase Auth.";
    }

    return `We could not send the magic link: ${message}`;
}

function describeWaitlistJoinError(error) {
    const message = String(error?.message || "");
    const lowerMessage = message.toLowerCase();

    if (!message) return "We could not join the waitlist. Please try again.";
    if (lowerMessage.includes("join_waitlist_with_referral")) {
        return "Supabase is still using an older referral function. Re-run the latest SQL script and try again.";
    }
    if (lowerMessage.includes("referred_by_code") || lowerMessage.includes("referred_by_user_id") || lowerMessage.includes("referred_at")) {
        return "The referral columns are missing in Supabase. Re-run the latest SQL script.";
    }
    if (lowerMessage.includes("waitlist_referral_events") || lowerMessage.includes("waitlist_referrals")) {
        return "The referral tables are missing in Supabase. Re-run the latest SQL script.";
    }
    if (lowerMessage.includes("duplicate") || lowerMessage.includes("unique")) {
        return "That email is already on the waitlist.";
    }

    return `We could not join the waitlist: ${message}`;
}

function describeReferralError(error) {
    const message = String(error?.message || "").toLowerCase();

    if (!message) return "We could not create your referral link right now.";
    if (message.includes("waitlist_email_required")) return "That email is not on the waitlist yet. Join the waitlist first.";
    if (message.includes("email_required")) return "We could not read your email from the login session. Open the magic link again.";
    if (message.includes("auth_required")) return "Your login session expired. Please log in again.";
    if (message.includes("get_or_create_my_referral")) return "Supabase is missing the referral function. Re-run the latest SQL script.";
    if (message.includes("waitlist_referrals")) return "The referral table is missing in Supabase. Re-run the latest SQL script.";

    return "We could not create your referral link right now.";
}

function initReferralDust() {
    const page = document.body;
    if (!(page instanceof HTMLBodyElement)) return;

    const canvas = document.createElement("canvas");
    canvas.className = "dust-canvas";
    canvas.setAttribute("aria-hidden", "true");
    page.prepend(canvas);

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
        canvas.remove();
        return;
    }

    const root = document.documentElement;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const state = {
        animationFrameId: 0,
        documentHeight: 0,
        lastFrameTime: 0,
        pageWidth: 0,
        particles: [],
        pixelRatio: 1,
        reducedMotion: motionQuery.matches,
        settings: null,
        viewportHeight: 0,
        viewportWidth: 0
    };

    const readNumber = (styles, propertyName, fallback) => {
        const rawValue = styles.getPropertyValue(propertyName).trim();
        const parsedValue = Number.parseFloat(rawValue);
        return Number.isFinite(parsedValue) ? parsedValue : fallback;
    };

    const readParticleColor = (styles, propertyName, fallback) => {
        const rawValue = styles.getPropertyValue(propertyName).trim();
        const channels = (rawValue || fallback)
            .split(/[\s,]+/)
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 3);

        if (channels.length !== 3 || channels.some((value) => Number.isNaN(Number.parseFloat(value)))) {
            return fallback.replace(/\s+/g, ", ");
        }

        return channels.join(", ");
    };

    const readSettings = () => {
        const styles = getComputedStyle(root);
        const sizeMin = Math.max(0.2, readNumber(styles, "--dust-size-min", 0.7));
        const sizeMax = Math.max(sizeMin, readNumber(styles, "--dust-size-max", 2.1));

        return {
            color: readParticleColor(styles, "--dust-particle-color", "255 255 255"),
            count: Math.max(0, Math.round(readNumber(styles, "--dust-particle-count", 110))),
            noiseScale: Math.max(0.0001, readNumber(styles, "--dust-noise-scale", 0.0018)),
            sizeMax,
            sizeMin,
            speed: Math.max(1, readNumber(styles, "--dust-speed", 16))
        };
    };

    const randomBetween = (min, max) => min + (Math.random() * (max - min));

    const sampleFlow = (x, y, time, scale) => {
        const scaledX = x * scale;
        const scaledY = y * scale;

        return (
            Math.sin((scaledX * 1.7) + (time * 0.21)) +
            Math.cos((scaledY * 1.35) - (time * 0.16)) +
            Math.sin(((scaledX + scaledY) * 0.92) + (time * 0.11))
        );
    };

    const buildParticle = (settings) => {
        const size = randomBetween(settings.sizeMin, settings.sizeMax);
        const sizeProgress = (size - settings.sizeMin) / Math.max(settings.sizeMax - settings.sizeMin, 0.001);

        return {
            alpha: 0.08 + (sizeProgress * 0.12) + (Math.random() * 0.05),
            drift: randomBetween(0.35, 0.85),
            seed: randomBetween(0, Math.PI * 2),
            size,
            speed: settings.speed * randomBetween(0.6, 1.25),
            twinkle: randomBetween(0.75, 1.35),
            x: randomBetween(0, state.pageWidth),
            y: randomBetween(0, state.documentHeight)
        };
    };

    const rebuildParticles = () => {
        const settings = readSettings();
        state.settings = settings;
        state.particles = Array.from({ length: settings.count }, () => buildParticle(settings));
    };

    const measureScene = () => {
        state.pageWidth = Math.max(root.clientWidth, window.innerWidth || 0, 1);
        state.documentHeight = Math.max(
            root.scrollHeight,
            page.scrollHeight,
            root.clientHeight,
            window.innerHeight || 0,
            1
        );
        state.viewportWidth = Math.max(window.innerWidth || 0, 1);
        state.viewportHeight = Math.max(window.innerHeight || root.clientHeight || 0, 1);
        state.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

        canvas.width = Math.round(state.viewportWidth * state.pixelRatio);
        canvas.height = Math.round(state.viewportHeight * state.pixelRatio);
        context.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
    };

    const drawParticles = (now) => {
        if (!state.settings) return;

        context.clearRect(0, 0, state.viewportWidth, state.viewportHeight);

        const scrollY = window.scrollY || window.pageYOffset || 0;

        for (const particle of state.particles) {
            const renderY = particle.y - scrollY;

            if (renderY < (-particle.size * 4) || renderY > (state.viewportHeight + (particle.size * 4))) {
                continue;
            }

            const opacity = particle.alpha * (0.82 + (0.18 * Math.sin((now * 0.0011 * particle.twinkle) + particle.seed)));

            context.beginPath();
            context.fillStyle = `rgba(${state.settings.color}, ${opacity.toFixed(3)})`;
            context.arc(particle.x, renderY, particle.size, 0, Math.PI * 2);
            context.fill();
        }
    };

    const updateParticles = (deltaTime, now) => {
        if (!state.settings) return;

        const time = now * 0.001;
        const wrapWidth = state.pageWidth + 80;
        const wrapHeight = state.documentHeight + 80;

        for (const particle of state.particles) {
            const field = sampleFlow(particle.x, particle.y, time + particle.seed, state.settings.noiseScale);
            const angle = field * Math.PI;

            particle.x += Math.sin(angle) * particle.speed * particle.drift * deltaTime * 0.65;
            particle.y += particle.speed * deltaTime * (0.72 + (0.28 * Math.cos(angle)));

            if (particle.x < -40) {
                particle.x += wrapWidth;
            } else if (particle.x > (state.pageWidth + 40)) {
                particle.x -= wrapWidth;
            }

            if (particle.y > (state.documentHeight + 40)) {
                particle.y -= wrapHeight;
            }
        }
    };

    const stopAnimation = () => {
        if (!state.animationFrameId) return;
        window.cancelAnimationFrame(state.animationFrameId);
        state.animationFrameId = 0;
    };

    const renderFrame = (now) => {
        if (!state.lastFrameTime) {
            state.lastFrameTime = now;
        }

        const deltaTime = Math.min((now - state.lastFrameTime) / 1000, 0.033);
        state.lastFrameTime = now;

        updateParticles(deltaTime, now);
        drawParticles(now);

        state.animationFrameId = window.requestAnimationFrame(renderFrame);
    };

    const renderStaticFrame = () => {
        drawParticles(performance.now());
    };

    const syncScene = () => {
        measureScene();
        rebuildParticles();
        state.lastFrameTime = 0;

        if (state.reducedMotion) {
            stopAnimation();
            renderStaticFrame();
            return;
        }

        stopAnimation();
        state.animationFrameId = window.requestAnimationFrame(renderFrame);
    };

    const handleScroll = () => {
        if (!state.reducedMotion) return;
        renderStaticFrame();
    };

    const handleVisibility = () => {
        if (document.hidden) {
            stopAnimation();
            return;
        }

        if (state.reducedMotion) {
            renderStaticFrame();
            return;
        }

        state.lastFrameTime = 0;
        stopAnimation();
        state.animationFrameId = window.requestAnimationFrame(renderFrame);
    };

    const handleMotionChange = (event) => {
        state.reducedMotion = event.matches;
        syncScene();
    };

    window.addEventListener("resize", syncScene, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);

    if (typeof motionQuery.addEventListener === "function") {
        motionQuery.addEventListener("change", handleMotionChange);
    } else if (typeof motionQuery.addListener === "function") {
        motionQuery.addListener(handleMotionChange);
    }

    if (typeof ResizeObserver === "function") {
        const resizeObserver = new ResizeObserver(() => {
            syncScene();
        });

        resizeObserver.observe(page);
    }

    syncScene();
}
