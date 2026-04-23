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

    const revealGroup = (group) => {
        group.classList.add("is-visible");

        const featureStory = group.closest(".feature-story");
        if (featureStory instanceof HTMLElement) {
            featureStory.classList.add("is-visible");
        }
    };

    const scrollRevealGroups = revealGroups.filter((group) => group.dataset.revealOn === "scroll");
    if (prefersReducedMotion || typeof IntersectionObserver !== "function") {
        scrollRevealGroups.forEach(revealGroup);
    } else {
        const revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                revealGroup(entry.target);
                observer.unobserve(entry.target);
            });
        }, {
            threshold: 0.55,
            rootMargin: "0px 0px -10% 0px"
        });

        scrollRevealGroups.forEach((group) => revealObserver.observe(group));
    }

    const storageSwitcher = document.querySelector("[data-storage-switcher]");
    const storagePanels = Array.from(storageSwitcher?.querySelectorAll("[data-storage-panel]") ?? []);
    const storageDots = Array.from(document.querySelectorAll("[data-storage-dot]"));

    let activeStorageIndex = Math.max(0, storagePanels.findIndex((panel) => panel.classList.contains("is-active")));

    const setActiveStoragePanel = (nextIndex) => {
        if (!storagePanels.length || storagePanels.length !== storageDots.length) return;

        activeStorageIndex = (nextIndex + storagePanels.length) % storagePanels.length;

        storagePanels.forEach((panel, panelIndex) => {
            const isActive = panelIndex === activeStorageIndex;
            panel.classList.toggle("is-active", isActive);
            panel.setAttribute("aria-hidden", String(!isActive));
        });

        storageDots.forEach((dot, dotIndex) => {
            const isActive = dotIndex === activeStorageIndex;
            dot.classList.toggle("is-active", isActive);

            if (isActive) {
                dot.setAttribute("aria-current", "true");
            } else {
                dot.removeAttribute("aria-current");
            }
        });
    };

    if (storagePanels.length && storagePanels.length === storageDots.length) {
        storageDots.forEach((dot, dotIndex) => {
            dot.addEventListener("click", () => {
                setActiveStoragePanel(dotIndex);
            });
        });

        setActiveStoragePanel(activeStorageIndex);
    }

    const syncMotionPreference = (event) => {
        prefersReducedMotion = event.matches;
        if (prefersReducedMotion) {
            scrollRevealGroups.forEach(revealGroup);
        }
    };

    if (typeof motionQuery.addEventListener === "function") {
        motionQuery.addEventListener("change", syncMotionPreference);
    } else if (typeof motionQuery.addListener === "function") {
        motionQuery.addListener(syncMotionPreference);
    }
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
