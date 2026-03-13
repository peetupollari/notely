document.addEventListener("DOMContentLoaded", () => {
    const forms = Array.from(document.querySelectorAll(".waitlist-form"));
    if (!forms.length) return;

    const SUPABASE_URL = "https://hrsjiejhvrlfjuzbxzgv.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhyc2ppZWpodnJsZmp1emJ4emd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NzM0MDksImV4cCI6MjA4NzM0OTQwOX0.5G1nKpGhtUnF9fQr2bOIKgJMG8BDX8OFsiIMKYTEORY";

    const setStatus = (statusElement, message, tone = "info") => {
        if (!statusElement) return;
        statusElement.textContent = message;
        statusElement.classList.remove("error", "success", "info");
        statusElement.classList.toggle("visible", Boolean(message));
        if (message) statusElement.classList.add(tone);
    };

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
        return;
    }

    const { createClient } = window.supabase;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
