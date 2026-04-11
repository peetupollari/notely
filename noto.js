document.addEventListener("DOMContentLoaded", () => {
    const forms = Array.from(document.querySelectorAll(".waitlist-form"));
    if (!forms.length) return;
    const waitlistCountElement = document.querySelector("[data-waitlist-count]");
    const waitlistCountText = waitlistCountElement?.querySelector("[data-waitlist-count-text]") ?? null;

    const SUPABASE_URL = "https://hrsjiejhvrlfjuzbxzgv.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhyc2ppZWpodnJsZmp1emJ4emd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NzM0MDksImV4cCI6MjA4NzM0OTQwOX0.5G1nKpGhtUnF9fQr2bOIKgJMG8BDX8OFsiIMKYTEORY";

    const setStatus = (statusElement, message, tone = "info") => {
        if (!statusElement) return;
        statusElement.textContent = message;
        statusElement.classList.remove("error", "success", "info");
        statusElement.classList.toggle("visible", Boolean(message));
        if (message) statusElement.classList.add(tone);
    };

    const setWaitlistCount = (message) => {
        if (!(waitlistCountText instanceof HTMLElement)) return;
        waitlistCountText.textContent = message;
    };

    const formatWaitlistCount = (count) => {
        const countLabel = count.toLocaleString();
        return count === 1
            ? `${countLabel} person already on the waitlist`
            : `${countLabel} people already on the waitlist`;
    };

    let waitlistCountRequest = null;

    const activeConfettiParticles = [];
    let confettiFrameId = 0;

    const stepConfetti = (now) => {
        for (let index = activeConfettiParticles.length - 1; index >= 0; index -= 1) {
            const particle = activeConfettiParticles[index];
            const elapsed = (now - particle.startTime) / 1000;

            if (elapsed < 0) continue;

            const x = particle.originX + (particle.vx * elapsed);
            const y = particle.originY + (particle.vy * elapsed) + (0.5 * particle.gravity * elapsed * elapsed);
            const rotation = particle.rotationStart + (particle.rotationVelocity * elapsed);
            const fadeStart = particle.duration * 0.58;
            const opacity = elapsed >= fadeStart
                ? Math.max(0, 1 - ((elapsed - fadeStart) / (particle.duration - fadeStart)))
                : 1;

            if (elapsed >= particle.duration || y >= (window.innerHeight + 140)) {
                particle.element.remove();
                activeConfettiParticles.splice(index, 1);
                continue;
            }

            particle.element.style.opacity = opacity.toFixed(3);
            particle.element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rotation.toFixed(2)}deg) scale(${particle.scale.toFixed(2)})`;
        }

        if (!activeConfettiParticles.length) {
            confettiFrameId = 0;
            return;
        }

        confettiFrameId = window.requestAnimationFrame(stepConfetti);
    };

    const ensureConfettiLoop = () => {
        if (confettiFrameId) return;
        confettiFrameId = window.requestAnimationFrame(stepConfetti);
    };

    const launchWaitlistConfetti = (button) => {
        if (!(button instanceof HTMLButtonElement)) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        const rect = button.getBoundingClientRect();
        const originX = rect.left + (rect.width / 2);
        const originY = rect.top + (rect.height * 0.5);
        const particleCount = 112;
        const emissionWindow = 900;

        const spawnParticle = () => {
            const particle = document.createElement("span");
            const launchAngle = (-Math.PI / 2) + ((Math.random() - 0.5) * 1.08);
            const launchSpeed = 430 + (Math.random() * 170);
            const duration = 2 + (Math.random() * 0.85);

            particle.className = "waitlist-confetti-piece";
            particle.style.setProperty("--confetti-width", `${(4 + (Math.random() * 5)).toFixed(2)}px`);
            particle.style.setProperty("--confetti-height", `${(8 + (Math.random() * 12)).toFixed(2)}px`);
            if (Math.random() > 0.55) particle.style.borderRadius = "2px";

            document.body.appendChild(particle);
            activeConfettiParticles.push({
                element: particle,
                originX,
                originY,
                vx: Math.cos(launchAngle) * launchSpeed,
                vy: Math.sin(launchAngle) * launchSpeed,
                gravity: 980 + (Math.random() * 260),
                duration,
                startTime: performance.now(),
                rotationStart: Math.random() * 360,
                rotationVelocity: -540 + (Math.random() * 1080),
                scale: 0.78 + (Math.random() * 0.72)
            });
            ensureConfettiLoop();
        };

        for (let index = 0; index < particleCount; index += 1) {
            const delay = Math.random() * emissionWindow;
            window.setTimeout(spawnParticle, delay);
        }
    };

    const resolveStatusForForm = (form) => {
        const next = form.nextElementSibling;
        if (next instanceof HTMLElement && next.classList.contains("waitlist-status")) return next;
        return form.closest(".hero-title, .pricing-text, .pricing, .hero, body")?.querySelector(".waitlist-status") ?? null;
    };

    const configMissing =
        SUPABASE_URL.includes("YOUR_SUPABASE_URL") ||
        SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");

    const contexts = forms.map((form) => {
        const emailInput = form.querySelector('input[name="email"]');
        const submitButton = form.querySelector('button[type="submit"]');
        const status = resolveStatusForForm(form);
        if (!(emailInput instanceof HTMLInputElement) || !(submitButton instanceof HTMLButtonElement) || !status) {
            return null;
        }

        return {
            form,
            emailInput,
            submitButton,
            status,
            defaultButtonContent: submitButton.innerHTML
        };
    }).filter(Boolean);

    if (!contexts.length) return;

    if (!window.supabase || configMissing) {
        contexts.forEach((context) => {
            setStatus(context.status, "Waitlist is not configured yet.", "error");
        });
        setWaitlistCount("Waitlist count unavailable right now.");
        return;
    }

    const { createClient } = window.supabase;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const WAITLIST_COUNT_REFRESH_MS = 15000;

    const refreshWaitlistCount = ({ showLoading = false } = {}) => {
        if (!(waitlistCountText instanceof HTMLElement)) return Promise.resolve(null);
        if (waitlistCountRequest) return waitlistCountRequest;
        if (showLoading) setWaitlistCount("Loading waitlist count...");

        waitlistCountRequest = (async () => {
            try {
                const { data, error } = await supabase.rpc("get_waitlist_count");

                if (error) throw error;
                const count = Number(data);

                if (!Number.isFinite(count) || count < 0) {
                    throw new Error("Waitlist count was not returned.");
                }

                setWaitlistCount(formatWaitlistCount(count));
                return count;
            } catch (error) {
                setWaitlistCount("Waitlist count unavailable right now.");
                console.error("Waitlist count fetch failed:", error);
                return null;
            } finally {
                waitlistCountRequest = null;
            }
        })();

        return waitlistCountRequest;
    };

    void refreshWaitlistCount({ showLoading: true });

    if (waitlistCountElement instanceof HTMLElement) {
        const waitlistCountIntervalId = window.setInterval(() => {
            if (document.hidden) return;
            void refreshWaitlistCount();
        }, WAITLIST_COUNT_REFRESH_MS);

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) return;
            void refreshWaitlistCount();
        });

        window.addEventListener("beforeunload", () => {
            window.clearInterval(waitlistCountIntervalId);
        }, { once: true });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    contexts.forEach((context) => {
        context.form.addEventListener("submit", async (event) => {
            event.preventDefault();
            let didJoinWaitlist = false;

            const email = context.emailInput.value.trim().toLowerCase();
            if (!emailPattern.test(email)) {
                setStatus(context.status, "Enter a valid email address.", "error");
                return;
            }

            context.submitButton.textContent = "Joining...";
            setStatus(context.status, "");

            try {
                const { error } = await supabase
                    .from("waitlist_emails")
                    .insert([{ email }]);

                if (error) {
                    if (error.code === "23505") {
                        setStatus(context.status, "You have already joined the waitlist.", "info");
                    } else {
                        setStatus(context.status, "Could not join waitlist. Please try again.", "error");
                        console.error("Waitlist insert failed:", error);
                    }
                    return;
                }

                context.form.reset();
                didJoinWaitlist = true;
                setStatus(context.status, "Thanks for joining the waitlist! We'll be in touch when the app is ready.", "info");
                void refreshWaitlistCount();
            } catch (err) {
                setStatus(context.status, "Could not join waitlist. Check your connection and try again.", "error");
                console.error("Waitlist request failed:", err);
            } finally {
                context.submitButton.innerHTML = context.defaultButtonContent;
                if (didJoinWaitlist) {
                    window.requestAnimationFrame(() => launchWaitlistConfetti(context.submitButton));
                }
            }
        });
    });
});

document.addEventListener("DOMContentLoaded", () => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = motionQuery.matches;

    const revealGroups = Array.from(document.querySelectorAll("[data-reveal-on]"));
    revealGroups.forEach((group) => {
        const lines = Array.from(group.querySelectorAll(".line-reveal"));
        lines.forEach((line, index) => {
            line.style.setProperty("--line-index", index);
        });
    });

    const scrollRevealGroups = revealGroups.filter((group) => group.dataset.revealOn === "scroll");
    if (prefersReducedMotion || typeof IntersectionObserver !== "function") {
        scrollRevealGroups.forEach((group) => group.classList.add("is-visible"));
    } else {
        const revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            });
        }, {
            threshold: 0.55,
            rootMargin: "0px 0px -10% 0px"
        });

        scrollRevealGroups.forEach((group) => revealObserver.observe(group));
    }

    const carousel = document.querySelector("[data-storage-carousel]");
    if (!(carousel instanceof HTMLElement)) return;

    const track = carousel.querySelector(".storage-carousel-track");
    const slides = Array.from(carousel.querySelectorAll("[data-storage-slide]"));
    const dots = Array.from(carousel.querySelectorAll("[data-storage-dot]"));
    if (!(track instanceof HTMLElement) || !slides.length || slides.length !== dots.length) return;

    let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains("is-active")));
    let autoplayId = 0;

    const setActiveSlide = (nextIndex) => {
        activeIndex = (nextIndex + slides.length) % slides.length;
        track.style.transform = `translateX(-${activeIndex * 100}%)`;

        slides.forEach((slide, slideIndex) => {
            const isActive = slideIndex === activeIndex;
            slide.classList.toggle("is-active", isActive);
            slide.setAttribute("aria-hidden", String(!isActive));
        });

        dots.forEach((dot, dotIndex) => {
            const isActive = dotIndex === activeIndex;
            dot.classList.toggle("is-active", isActive);
            if (isActive) {
                dot.setAttribute("aria-current", "true");
            } else {
                dot.removeAttribute("aria-current");
            }
        });
    };

    const stopAutoplay = () => {
        if (!autoplayId) return;
        window.clearInterval(autoplayId);
        autoplayId = 0;
    };

    const startAutoplay = () => {
        if (prefersReducedMotion || slides.length < 2) return;
        stopAutoplay();
        autoplayId = window.setInterval(() => {
            setActiveSlide(activeIndex + 1);
        }, 8000);
    };

    const maybeResumeAutoplay = () => {
        if (prefersReducedMotion) return;
        if (carousel.matches(":hover")) return;
        startAutoplay();
    };

    dots.forEach((dot, dotIndex) => {
        dot.addEventListener("click", () => {
            setActiveSlide(dotIndex);
            stopAutoplay();
            maybeResumeAutoplay();
        });
    });

    carousel.addEventListener("mouseenter", stopAutoplay);
    carousel.addEventListener("mouseleave", maybeResumeAutoplay);

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopAutoplay();
            return;
        }
        maybeResumeAutoplay();
    });

    const syncMotionPreference = (event) => {
        prefersReducedMotion = event.matches;
        if (prefersReducedMotion) {
            scrollRevealGroups.forEach((group) => group.classList.add("is-visible"));
            stopAutoplay();
            return;
        }
        maybeResumeAutoplay();
    };

    if (typeof motionQuery.addEventListener === "function") {
        motionQuery.addEventListener("change", syncMotionPreference);
    } else if (typeof motionQuery.addListener === "function") {
        motionQuery.addListener(syncMotionPreference);
    }

    setActiveSlide(activeIndex);
    maybeResumeAutoplay();
});

document.addEventListener("DOMContentLoaded", () => {
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
});
