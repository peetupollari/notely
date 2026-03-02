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
                setStatus(context.status, "Thanks for joining the waitlist! We'll be in touch when the app is ready.", "info");
            } catch (err) {
                setStatus(context.status, "Could not join waitlist. Check your connection and try again.", "error");
                console.error("Waitlist request failed:", err);
            } finally {
                context.submitButton.innerHTML = context.defaultButtonContent;
            }
        });
    });
});

document.addEventListener("DOMContentLoaded", () => {
    const stage = document.getElementById("features-stage");
    const featuresContent = stage?.querySelector(".features-content");
    const image = document.getElementById("features-image");
    const imageBase = document.getElementById("features-image-base");
    const imageNext = document.getElementById("features-image-next");
    const progressRail = document.getElementById("features-progress");
    const progressFill = document.getElementById("features-progress-fill");
    const progressDots = document.getElementById("features-progress-dots");
    const text = document.getElementById("features-image-text");

    if (!stage || !featuresContent || !image || !imageBase || !imageNext || !progressRail || !progressFill || !progressDots || !text) return;

    const mobileQuery = window.matchMedia("(max-width: 900px)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const easeInOutCubic = (value) => (value < 0.5
        ? 4 * Math.pow(value, 3)
        : 1 - (Math.pow(-2 * value + 2, 3) / 2));
    const BLOCK_ENTER_PORTION = 0.24;
    const BLOCK_EXIT_PORTION = BLOCK_ENTER_PORTION;
    const BLOCK_HOLD_PORTION = 1 - BLOCK_ENTER_PORTION - BLOCK_EXIT_PORTION;
    const TEXT_SEQUENCE_START = 0.05;
    const TEXT_SEQUENCE_SPAN = 0.9;
    const IMAGE_START_BEFORE_FIRST_BLOCK_SLOTS = 0.9;
    const IMAGE_FINISH_AFTER_FIRST_START_SLOTS = 0.14;
    const ITEM_OFFSET_PX = 58;
    const PREVIEW_BASE_LIFT = 30;
    const PREVIEW_OVERFLOW_LIFT_FACTOR = 0.5;
    const PROGRESS_EPSILON = 0.0004;
    const SCROLL_SMOOTHING = 0.22;
    const DOT_FOCUS_DURATION_MS = 2100;
    const DOT_FOCUS_PROGRESS_DURATION_MS = 320;
    const FAST_SCROLL_JUMP_MIN_DELTA = 0.12;
    const FAST_SCROLL_JUMP_SLOT_FACTOR = 0.85;
    const STEP_HOLD_POINT = Math.min(BLOCK_ENTER_PORTION + (BLOCK_HOLD_PORTION * 0.5), 0.98);
    const LINE_OFFSET_PX = 14;
    const LINE_ENTER_STAGGER = 0.1;
    const LINE_ENTER_SPAN = 0.38;
    const LINE_EXIT_STAGGER = LINE_ENTER_STAGGER;
    const LINE_EXIT_SPAN = LINE_ENTER_SPAN;
    const DEFAULT_FEATURE_IMAGE = "images/Screenshot 2026-02-22 020000.png";
    const fallbackFeatures = [
        {
            title: "Feature content unavailable",
            description: "The site could not load features.json.",
            points: ["Check that features.json exists and is valid JSON."],
            image: DEFAULT_FEATURE_IMAGE
        }
    ];

    let featureData = [];
    let featureItems = [];
    let featureLineGroups = [];
    let progressDotItems = [];
    let featureCount = 0;
    let desiredStageProgress = 0;
    let renderedStageProgress = 0;
    let activeAnimationFrame = null;
    let lastRenderTimestamp = 0;
    let dotFocusState = null;
    const isNavJumpSuppressed = () => (window.__notoNavJumpLockUntil ?? 0) > performance.now();

    const escapeHtml = (value) => value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const sanitizeHref = (href) => {
        try {
            const url = new URL(href, window.location.href);
            if (["http:", "https:", "mailto:"].includes(url.protocol)) return url.href;
            return "#";
        } catch {
            return "#";
        }
    };

    const renderInlineMarkdown = (source) => {
        let html = escapeHtml(source);
        const tokenStore = [];
        const createToken = (fragment) => {
            const token = `@@md_token_${tokenStore.length}@@`;
            tokenStore.push(fragment);
            return token;
        };

        html = html.replace(/`([^`]+?)`/g, (_, codeText) => createToken(`<code>${codeText}</code>`));
        html = html.replace(
            /(^|[^\\])\$([^\n$]+?)\$/g,
            (_, prefix, expression) => `${prefix}${createToken(`<span class="markdown-math-inline">$${expression}$</span>`)}`
        );
        html = html.replace(/\[([^\]]+?)\]\(([^)\s]+)\)/g, (_, label, href) =>
            `<a href="${sanitizeHref(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
        html = html.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/\*([^*]+?)\*/g, "<em>$1</em>");
        html = html.replace(/~~([^~]+?)~~/g, "<del>$1</del>");
        html = html.replace(/@@md_token_(\d+)@@/g, (_, tokenIndex) => tokenStore[Number(tokenIndex)] || "");
        html = html.replace(/\\\$/g, "$");
        return html;
    };

    const parseTableCells = (line) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.includes("|")) return null;

        let row = trimmed;
        if (row.startsWith("|")) row = row.slice(1);
        if (row.endsWith("|")) row = row.slice(0, -1);

        const cells = row.split("|").map((cell) => cell.trim());
        return cells.length >= 2 ? cells : null;
    };

    const isMarkdownTableDivider = (line) => {
        const cells = parseTableCells(line);
        if (!cells) return false;
        return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
    };

    const tableAlignFromDividerCell = (cell) => {
        if (/^:-{3,}:$/.test(cell)) return "center";
        if (/^-{3,}:$/.test(cell)) return "right";
        if (/^:-{3,}$/.test(cell)) return "left";
        return "";
    };

    const normalizeFenceLanguage = (value) => value
        .toLowerCase()
        .replace(/[^a-z0-9#+.-]/g, "");

    let mathJaxLoadBound = false;
    let pendingMathTypePromise = null;
    const pendingMathRoots = new Set();

    const flushMathTypesetQueue = () => {
        if (!pendingMathRoots.size) return;
        if (!window.MathJax || typeof window.MathJax.typesetPromise !== "function") return;
        if (pendingMathTypePromise) return;

        const roots = Array.from(pendingMathRoots);
        pendingMathRoots.clear();

        pendingMathTypePromise = window.MathJax.typesetPromise(roots)
            .catch((error) => {
                console.error("Math typeset failed:", error);
            })
            .finally(() => {
                pendingMathTypePromise = null;
                requestTick();
                if (pendingMathRoots.size) flushMathTypesetQueue();
            });
    };

    const bindMathJaxLoad = () => {
        if (mathJaxLoadBound) return;
        const mathScript = document.getElementById("mathjax-script");
        if (!mathScript) return;
        mathJaxLoadBound = true;
        mathScript.addEventListener("load", () => {
            flushMathTypesetQueue();
        });
    };

    const queueMathTypeset = (root) => {
        if (!root) return;
        pendingMathRoots.add(root);
        bindMathJaxLoad();
        flushMathTypesetQueue();
    };

    let hljsLoadBound = false;
    const pendingHighlightRoots = new Set();

    const flushCodeHighlightQueue = () => {
        if (!pendingHighlightRoots.size) return;
        if (!window.hljs || typeof window.hljs.highlightElement !== "function") return;

        const roots = Array.from(pendingHighlightRoots);
        pendingHighlightRoots.clear();

        roots.forEach((root) => {
            root.querySelectorAll("pre code").forEach((codeBlock) => {
                window.hljs.highlightElement(codeBlock);
            });
        });

        requestTick();
    };

    const bindHighlightLoad = () => {
        if (hljsLoadBound) return;
        const script = document.getElementById("hljs-script");
        if (!script) return;
        hljsLoadBound = true;
        script.addEventListener("load", () => {
            flushCodeHighlightQueue();
        });
    };

    const queueCodeHighlight = (root) => {
        if (!root) return;
        pendingHighlightRoots.add(root);
        bindHighlightLoad();
        flushCodeHighlightQueue();
    };

    const renderMarkdownAndHtml = (source) => {
        const lines = source.replace(/\r\n/g, "\n").split("\n");
        const output = [];
        let openListClass = "";
        let lineIndex = 0;

        const closeList = () => {
            if (!openListClass) return;
            output.push("</ul>");
            openListClass = "";
        };

        const openList = (className) => {
            if (openListClass === className) return;
            closeList();
            openListClass = className;
            output.push(`<ul class="${className}">`);
        };

        while (lineIndex < lines.length) {
            const line = lines[lineIndex];
            const trimmed = line.trim();

            if (!trimmed) {
                closeList();
                lineIndex += 1;
                continue;
            }

            const codeFenceMatch = trimmed.match(/^```([a-zA-Z0-9#+.-]*)\s*$/);
            if (codeFenceMatch) {
                closeList();
                const language = normalizeFenceLanguage(codeFenceMatch[1] || "");
                lineIndex += 1;
                const codeLines = [];
                while (lineIndex < lines.length && !lines[lineIndex].trim().startsWith("```")) {
                    codeLines.push(lines[lineIndex]);
                    lineIndex += 1;
                }
                if (lineIndex < lines.length && lines[lineIndex].trim().startsWith("```")) {
                    lineIndex += 1;
                }
                const codeHtml = escapeHtml(codeLines.join("\n"));
                const languageClass = language ? `language-${language}` : "";
                const languageLabel = language ? ` data-language="${language}"` : "";
                const codeClass = languageClass ? ` class="${languageClass}"` : "";
                output.push(
                    `<pre class="markdown-code-block"${languageLabel}><code${codeClass}>${codeHtml}</code></pre>`
                );
                continue;
            }

            const singleLineMathMatch = trimmed.match(/^\$\$(.+)\$\$$/);
            if (singleLineMathMatch) {
                closeList();
                output.push(`<div class="markdown-math-block">$$${escapeHtml(singleLineMathMatch[1].trim())}$$</div>`);
                lineIndex += 1;
                continue;
            }

            if (trimmed === "$$") {
                closeList();
                lineIndex += 1;
                const mathBlockLines = [];
                while (lineIndex < lines.length && lines[lineIndex].trim() !== "$$") {
                    mathBlockLines.push(lines[lineIndex]);
                    lineIndex += 1;
                }
                if (lineIndex < lines.length && lines[lineIndex].trim() === "$$") {
                    lineIndex += 1;
                }
                const mathBlock = mathBlockLines.join("\n").trim();
                output.push(`<div class="markdown-math-block">$$${escapeHtml(mathBlock)}$$</div>`);
                continue;
            }

            const headerCells = parseTableCells(trimmed);
            if (headerCells && lineIndex + 1 < lines.length && isMarkdownTableDivider(lines[lineIndex + 1])) {
                closeList();

                const dividerCells = parseTableCells(lines[lineIndex + 1]) || [];
                const alignments = headerCells.map((_, cellIndex) =>
                    tableAlignFromDividerCell(dividerCells[cellIndex] || "")
                );
                const tableRows = [];

                lineIndex += 2;
                while (lineIndex < lines.length) {
                    const rowCells = parseTableCells(lines[lineIndex]);
                    if (!rowCells) break;
                    const normalizedCells = rowCells.slice(0, headerCells.length);
                    while (normalizedCells.length < headerCells.length) normalizedCells.push("");
                    tableRows.push(normalizedCells);
                    lineIndex += 1;
                }

                const thHtml = headerCells.map((cell, cellIndex) => {
                    const align = alignments[cellIndex] ? ` style="text-align:${alignments[cellIndex]};"` : "";
                    return `<th${align}>${renderInlineMarkdown(cell)}</th>`;
                }).join("");

                const bodyHtml = tableRows.map((row) =>
                    `<tr>${row.map((cell, cellIndex) => {
                        const align = alignments[cellIndex] ? ` style="text-align:${alignments[cellIndex]};"` : "";
                        return `<td${align}>${renderInlineMarkdown(cell)}</td>`;
                    }).join("")}</tr>`
                ).join("");

                output.push(
                    `<div class="markdown-table-wrap"><table class="markdown-table"><thead><tr>${thHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
                );
                continue;
            }

            const checkboxMatch = trimmed.match(/^- \[( |x|X)\]\s+(.+)$/);
            if (checkboxMatch) {
                openList("markdown-checklist");
                const isChecked = checkboxMatch[1].toLowerCase() === "x";
                const labelHtml = renderInlineMarkdown(checkboxMatch[2]);
                output.push(
                    `<li class="markdown-check-item"><label><input type="checkbox" ${isChecked ? "checked " : ""}tabindex="-1" aria-hidden="true"><span>${labelHtml}</span></label></li>`
                );
                lineIndex += 1;
                continue;
            }

            const listMatch = trimmed.match(/^- (.+)$/);
            if (listMatch) {
                openList("markdown-list");
                output.push(`<li>${renderInlineMarkdown(listMatch[1])}</li>`);
                lineIndex += 1;
                continue;
            }

            const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                closeList();
                const level = headingMatch[1].length;
                output.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
                lineIndex += 1;
                continue;
            }

            const quoteMatch = trimmed.match(/^>\s+(.+)$/);
            if (quoteMatch) {
                closeList();
                output.push(`<blockquote>${renderInlineMarkdown(quoteMatch[1])}</blockquote>`);
                lineIndex += 1;
                continue;
            }

            if (/^<[^>]+>/.test(trimmed)) {
                closeList();
                output.push(line);
                lineIndex += 1;
                continue;
            }

            closeList();
            output.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
            lineIndex += 1;
        }

        closeList();
        return output.join("\n");
    };

    const normalizeFeature = (feature) => {
        if (!feature || typeof feature !== "object") return null;

        const title = typeof feature.title === "string" ? feature.title.trim() : "";
        const description = typeof feature.description === "string" ? feature.description.trim() : "";
        const featureImage = typeof feature.image === "string" && feature.image.trim()
            ? feature.image.trim()
            : DEFAULT_FEATURE_IMAGE;
        const markdownSource = typeof feature.markdown === "string" ? feature.markdown : "";
        const markdown = markdownSource.trim() ? markdownSource : "";
        const points = Array.isArray(feature.points)
            ? feature.points.filter((point) => typeof point === "string").map((point) => point.trim()).filter(Boolean)
            : [];

        if (!title && !description && !points.length && !markdown) return null;

        return {
            title,
            description,
            points,
            image: featureImage,
            markdown
        };
    };

    const parseFeaturesPayload = (payload) => {
        const list = Array.isArray(payload) ? payload : payload?.features;
        if (!Array.isArray(list)) return [];
        return list.map(normalizeFeature).filter(Boolean);
    };

    const loadFeatures = async () => {
        try {
            const response = await fetch("features.json", { cache: "no-store" });
            if (!response.ok) throw new Error(`features.json request failed: ${response.status}`);
            const payload = await response.json();
            const parsed = parseFeaturesPayload(payload);
            if (!parsed.length) throw new Error("features.json does not contain valid feature entries.");
            return parsed;
        } catch (error) {
            console.error("Feature data load failed:", error);
            return fallbackFeatures;
        }
    };

    const setStageHeight = (count) => {
        if (mobileQuery.matches) {
            stage.style.height = "auto";
            return;
        }

        const baseVh = 160;
        const perFeatureVh = 120;
        const computedVh = Math.max(260, baseVh + (count * perFeatureVh));
        stage.style.height = `${computedVh}vh`;
    };

    const getSequenceProgressFromPageProgress = (pageProgress) =>
        clamp((pageProgress - TEXT_SEQUENCE_START) / TEXT_SEQUENCE_SPAN, 0, 1);

    const getPageProgressFromSequenceProgress = (sequenceProgress) =>
        clamp(TEXT_SEQUENCE_START + (sequenceProgress * TEXT_SEQUENCE_SPAN), 0, 1);

    const getSequenceProgressForFeatureIndex = (index) => {
        if (!featureCount) return 0;
        const boundedIndex = clamp(Math.floor(index), 0, featureCount - 1);
        return clamp((boundedIndex + STEP_HOLD_POINT) / featureCount, 0, 1);
    };

    const getFeatureIndexFromPageProgress = (pageProgress) => {
        if (!featureCount) return 0;
        const sequenceProgress = getSequenceProgressFromPageProgress(pageProgress);
        const rawIndex = Math.floor(sequenceProgress * featureCount);
        return clamp(rawIndex, 0, featureCount - 1);
    };

    const getDiscreteStageProgressFromPageProgress = (pageProgress) => {
        if (pageProgress < TEXT_SEQUENCE_START) {
            return 0;
        }
        const featureIndex = getFeatureIndexFromPageProgress(pageProgress);
        const sequenceProgress = getSequenceProgressForFeatureIndex(featureIndex);
        return getPageProgressFromSequenceProgress(sequenceProgress);
    };

    const getStageProgressFromViewport = () => {
        const scrollRange = stage.offsetHeight - window.innerHeight;
        if (scrollRange <= 0) return 1;
        const rect = stage.getBoundingClientRect();
        return clamp((-rect.top) / scrollRange, 0, 1);
    };

    const beginManualBlockFocus = (rawIndex, options = {}) => {
        if (!featureCount) return null;

        const index = clamp(Math.floor(rawIndex), 0, featureCount - 1);
        const durationMs = Math.max(options.durationMs ?? DOT_FOCUS_DURATION_MS, 1);
        const progressDurationMs = Math.max(options.progressDurationMs ?? DOT_FOCUS_PROGRESS_DURATION_MS, 1);
        const lockInput = Boolean(options.lockInput);

        const startSequenceProgress = clamp((index + 0.0001) / Math.max(featureCount, 1), 0, 1);
        const startPageProgress = getPageProgressFromSequenceProgress(startSequenceProgress);
        const targetSequenceProgress = getSequenceProgressForFeatureIndex(index);
        const targetPageProgress = getPageProgressFromSequenceProgress(targetSequenceProgress);

        const currentSequenceProgress = getSequenceProgressFromPageProgress(renderedStageProgress);
        const currentSequenceState = getSequenceState(currentSequenceProgress);
        const fallbackFromFill = clamp(
            (currentSequenceState.activeIndex + currentSequenceState.enterProgress) / Math.max(featureCount, 1),
            0,
            1
        );
        const fromFill = options.fromFill === undefined || options.fromFill === null
            ? fallbackFromFill
            : clamp(options.fromFill, 0, 1);
        const targetFill = clamp((index + 1) / Math.max(featureCount, 1), 0, 1);

        renderedStageProgress = startPageProgress;
        desiredStageProgress = startPageProgress;
        dotFocusState = {
            startTime: performance.now(),
            durationMs,
            progressDurationMs,
            fromPageProgress: startPageProgress,
            toPageProgress: targetPageProgress,
            fromFill,
            targetFill,
            lockInput
        };

        renderFromStageProgress(startPageProgress);
        const startSequenceState = getSequenceState(startSequenceProgress);
        setProgressFrame(startSequenceState, {
            forceVisible: true,
            fillOverride: fromFill
        });

        return {
            index,
            targetPageProgress
        };
    };

    const scrollToFeatureIndex = (rawIndex) => {
        if (!featureCount || mobileQuery.matches) return;

        const index = Math.min(Math.max(Math.floor(rawIndex), 0), featureCount - 1);
        const scrollRange = stage.offsetHeight - window.innerHeight;
        if (scrollRange <= 0) return;

        const stageTop = window.scrollY + stage.getBoundingClientRect().top;
        const focusTarget = beginManualBlockFocus(index, {
            lockInput: true
        });
        if (!focusTarget) return;
        const targetPageProgress = focusTarget.targetPageProgress;
        const targetY = stageTop + (targetPageProgress * scrollRange);

        window.scrollTo({
            top: targetY,
            behavior: "auto"
        });

        startRenderLoop();
    };

    const renderProgressDots = (count) => {
        progressDots.innerHTML = "";
        progressDotItems = [];

        if (!count) {
            progressRail.style.setProperty("--progress-track-top", "0%");
            progressRail.style.setProperty("--progress-track-bottom", "0%");
            progressFill.style.transform = "scaleY(0)";
            return;
        }

        const trackTopPercent = count === 1 ? 50 : (1 / count) * 100;
        const trackBottomPercent = 0;
        progressRail.style.setProperty("--progress-track-top", `${trackTopPercent}%`);
        progressRail.style.setProperty("--progress-track-bottom", `${trackBottomPercent}%`);

        const fragment = document.createDocumentFragment();
        for (let index = 0; index < count; index += 1) {
            const dot = document.createElement("button");
            dot.type = "button";
            dot.className = "features-progress-dot";
            const topPosition = count === 1 ? 50 : ((index + 1) / count) * 100;
            dot.style.top = `${topPosition}%`;
            dot.setAttribute("aria-label", `Go to feature ${index + 1}`);
            dot.addEventListener("click", () => {
                scrollToFeatureIndex(index);
            });
            fragment.appendChild(dot);
        }

        progressDots.appendChild(fragment);
        progressDotItems = Array.from(progressDots.querySelectorAll(".features-progress-dot"));
        progressFill.style.transform = "scaleY(0)";
    };

    const createMarkdownPreview = (markdownSource) => {
        const preview = document.createElement("div");
        preview.className = "feature-preview feature-item-line";

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "feature-preview-toggle";

        const rendered = document.createElement("div");
        rendered.className = "feature-preview-rendered";
        rendered.innerHTML = renderMarkdownAndHtml(markdownSource);
        queueCodeHighlight(rendered);
        queueMathTypeset(rendered);

        const source = document.createElement("pre");
        source.className = "feature-preview-source";

        const code = document.createElement("code");
        code.textContent = markdownSource;
        source.appendChild(code);

        const setSourceMode = (showSource) => {
            preview.classList.toggle("show-source", showSource);
            rendered.setAttribute("aria-hidden", String(showSource));
            source.setAttribute("aria-hidden", String(!showSource));
            toggle.setAttribute("aria-pressed", String(showSource));
            toggle.textContent = showSource ? "Show preview" : "Show code";
        };

        toggle.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const showSource = !preview.classList.contains("show-source");
            setSourceMode(showSource);
            requestTick();
        });

        setSourceMode(false);
        preview.appendChild(toggle);
        preview.appendChild(rendered);
        preview.appendChild(source);
        return preview;
    };

    const createFeatureItem = (feature, index) => {
        const item = document.createElement("article");
        item.className = "feature-item";
        item.dataset.hasPreview = "0";

        const itemIndex = document.createElement("span");
        itemIndex.className = "feature-item-index feature-item-line";
        itemIndex.textContent = String(index + 1);
        item.appendChild(itemIndex);

        if (feature.title) {
            const title = document.createElement("h3");
            title.className = "feature-item-title feature-item-line";
            title.textContent = feature.title;
            item.appendChild(title);
        }

        if (feature.description) {
            const description = document.createElement("p");
            description.className = "feature-item-description feature-item-line";
            description.textContent = feature.description;
            item.appendChild(description);
        }

        if (feature.points.length) {
            const pointList = document.createElement("ul");
            pointList.className = "feature-item-points";
            feature.points.forEach((point) => {
                const itemPoint = document.createElement("li");
                itemPoint.className = "feature-item-line";
                itemPoint.textContent = point;
                pointList.appendChild(itemPoint);
            });
            item.appendChild(pointList);
        }

        if (feature.markdown) {
            item.appendChild(createMarkdownPreview(feature.markdown));
            item.dataset.hasPreview = "1";
        }

        return item;
    };

    const renderFeatureItems = (features) => {
        featureData = features;
        text.innerHTML = "";

        const fragment = document.createDocumentFragment();
        features.forEach((feature, index) => {
            fragment.appendChild(createFeatureItem(feature, index));
        });

        text.appendChild(fragment);
        featureItems = Array.from(text.querySelectorAll(".feature-item"));
        featureLineGroups = featureItems.map((item) =>
            Array.from(item.querySelectorAll(".feature-item-line"))
        );
        featureCount = featureItems.length;
        renderProgressDots(featureCount);

        const firstFeature = featureData[0];
        const firstImage = firstFeature?.image || DEFAULT_FEATURE_IMAGE;
        imageBase.src = firstImage;
        imageBase.alt = firstFeature?.title || "Noto app interface preview";
        imageNext.src = firstImage;
        imageNext.style.opacity = "0";
        text.style.setProperty("--feature-preview-balance-shift", "0px");

        setStageHeight(featureCount || 1);
        const initialRawProgress = getStageProgressFromViewport();
        const initialProgress = initialRawProgress;
        desiredStageProgress = initialProgress;
        renderedStageProgress = initialProgress;
        dotFocusState = null;
        lastRenderTimestamp = 0;
    };

    const getLayoutMetrics = () => {
        const contentRect = featuresContent.getBoundingClientRect();
        const availableWidth = Math.max(contentRect.width, 1);
        const availableHeight = Math.max(contentRect.height, 1);

        const imageBaseWidth = image.offsetWidth;
        const imageBaseHeight = image.offsetHeight;

        if (!imageBaseWidth || !imageBaseHeight) {
            return {
                centeredScale: 1,
                splitScale: 1,
                finalSlide: 0
            };
        }

        const imageCenterX = image.offsetLeft + (imageBaseWidth / 2);
        const textLeft = text.offsetLeft;
        const textWidth = text.offsetWidth;

        const safeGap = Math.max(20, availableWidth * 0.025);
        const desiredSlide = Math.min(window.innerWidth * 0.24, 340);
        const sideGap = Math.max(24, availableWidth * 0.035);
        const widthReservedForImage = Math.max(availableWidth - textWidth - sideGap, availableWidth * 0.38);

        const fitScaleByViewport = Math.min(
            widthReservedForImage / imageBaseWidth,
            availableHeight / imageBaseHeight,
            1
        );
        const fitScaleByTextAtDesiredSlide = ((textLeft - safeGap) - (imageCenterX - desiredSlide)) * 2 / imageBaseWidth;

        let splitScale = clamp(
            Math.min(fitScaleByViewport, fitScaleByTextAtDesiredSlide),
            0.36,
            1
        );

        const getSlideLimitByLeftEdge = (scale) =>
            Math.max(imageCenterX - safeGap - ((imageBaseWidth * scale) / 2), 0);

        let finalSlide = Math.min(desiredSlide, getSlideLimitByLeftEdge(splitScale));

        const fitScaleByTextAtFinalSlide = ((textLeft - safeGap) - (imageCenterX - finalSlide)) * 2 / imageBaseWidth;
        splitScale = clamp(Math.min(splitScale, fitScaleByTextAtFinalSlide), 0.36, 1);
        finalSlide = Math.min(desiredSlide, getSlideLimitByLeftEdge(splitScale));

        const centeredScaleLimit = splitScale + 0.26;
        const centeredScale = clamp(
            Math.min(availableWidth / imageBaseWidth, availableHeight / imageBaseHeight, centeredScaleLimit, 1),
            splitScale,
            1
        );

        return {
            centeredScale,
            splitScale,
            finalSlide
        };
    };

    const setLineFrame = (lines, enterProgress, exitProgress) => {
        lines.forEach((line, lineIndex) => {
            const enterStart = lineIndex * LINE_ENTER_STAGGER;
            const lineInProgress = clamp((enterProgress - enterStart) / LINE_ENTER_SPAN, 0, 1);
            const lineInEase = easeInOutCubic(lineInProgress);

            const exitStart = lineIndex * LINE_EXIT_STAGGER;
            const lineOutProgress = clamp((exitProgress - exitStart) / LINE_EXIT_SPAN, 0, 1);
            const lineOutEase = easeInOutCubic(lineOutProgress);

            const opacity = lineInEase * (1 - lineOutEase);
            const translateY = ((1 - lineInEase) * LINE_OFFSET_PX) - (lineOutEase * LINE_OFFSET_PX);

            line.style.opacity = String(opacity);
            line.style.transform = `translate3d(0, ${translateY}px, 0)`;
        });
    };

    const getSequenceState = (sequenceProgress) => {
        const boundedSequence = clamp(sequenceProgress, 0, 1);

        if (!featureCount) {
            return {
                boundedSequence,
                activeIndex: 0,
                enterProgress: 0,
                exitProgress: 0
            };
        }

        if (featureCount === 1) {
            return {
                boundedSequence,
                activeIndex: 0,
                enterProgress: 1,
                exitProgress: 0
            };
        }

        const scaled = boundedSequence * featureCount;
        const activeIndex = Math.min(Math.floor(scaled), featureCount - 1);
        const rawSlotProgress = scaled - activeIndex;
        const slotProgress = clamp(rawSlotProgress, 0, 1);

        const enterProgress = clamp(slotProgress / BLOCK_ENTER_PORTION, 0, 1);
        const exitProgress = clamp(
            (slotProgress - (BLOCK_ENTER_PORTION + BLOCK_HOLD_PORTION)) / BLOCK_EXIT_PORTION,
            0,
            1
        );

        return {
            boundedSequence,
            activeIndex,
            enterProgress,
            exitProgress
        };
    };

    const setSequenceFrame = (sequenceState) => {
        if (!featureCount) return;

        const {
            boundedSequence,
            activeIndex,
            enterProgress,
            exitProgress
        } = sequenceState;

        if (featureCount === 1) {
            const onlyItem = featureItems[0];
            onlyItem.style.opacity = "1";
            onlyItem.style.transform = "translate3d(0, 0, 0)";
            onlyItem.style.pointerEvents = "auto";
            setLineFrame(featureLineGroups[0] || [], 1, 0);
            const onlyHasPreview = featureItems[0]?.dataset.hasPreview === "1";
            const onlyContainerHeight = text.clientHeight || 0;
            const onlyItemHeight = onlyItem.scrollHeight || 0;
            const onlyOverflowLift = Math.max(0, onlyItemHeight - onlyContainerHeight) * PREVIEW_OVERFLOW_LIFT_FACTOR;
            text.style.setProperty(
                "--feature-preview-balance-shift",
                onlyHasPreview ? `${(PREVIEW_BASE_LIFT + onlyOverflowLift).toFixed(2)}px` : "0px"
            );
            return;
        }

        const enterEase = easeInOutCubic(enterProgress);
        const exitEase = easeInOutCubic(exitProgress);
        const activeItem = featureItems[activeIndex];
        const activeHasPreview = activeItem?.dataset.hasPreview === "1";
        const activeOpacity = activeIndex === featureCount - 1
            ? enterEase
            : enterEase * (1 - exitEase);
        const containerHeight = text.clientHeight || 0;
        const activeHeight = activeItem?.scrollHeight || 0;
        const previewOverflowLift = Math.max(0, activeHeight - containerHeight) * PREVIEW_OVERFLOW_LIFT_FACTOR;
        const previewBalanceShift = activeHasPreview
            ? (PREVIEW_BASE_LIFT + previewOverflowLift) * activeOpacity
            : 0;
        text.style.setProperty("--feature-preview-balance-shift", `${previewBalanceShift.toFixed(2)}px`);

        featureItems.forEach((item, index) => {
            let opacity = 0;
            let translateY = ITEM_OFFSET_PX;
            let lineEnterProgress = 0;
            let lineExitProgress = 0;

            if (index < activeIndex) {
                translateY = -ITEM_OFFSET_PX;
                lineEnterProgress = 1;
                lineExitProgress = 1;
            }

            if (index === activeIndex) {
                const isLastBlock = activeIndex === featureCount - 1;
                if (isLastBlock) {
                    opacity = enterEase;
                    translateY = (1 - enterEase) * ITEM_OFFSET_PX;
                    lineEnterProgress = enterProgress;
                    lineExitProgress = 0;
                } else {
                    opacity = enterEase * (1 - exitEase);
                    translateY = ((1 - enterEase) * ITEM_OFFSET_PX) - (exitEase * ITEM_OFFSET_PX);
                    lineEnterProgress = enterProgress;
                    lineExitProgress = exitProgress;
                }
            }

            if (index === featureCount - 1 && boundedSequence >= 1) {
                opacity = 1;
                translateY = 0;
                lineEnterProgress = 1;
                lineExitProgress = 0;
            }

            item.style.opacity = String(opacity);
            item.style.transform = `translate3d(0, ${translateY}px, 0)`;
            item.style.pointerEvents = (index === activeIndex && opacity > 0.2) ? "auto" : "none";
            setLineFrame(featureLineGroups[index] || [], lineEnterProgress, lineExitProgress);
        });
    };

    const setImageFrame = (sequenceState) => {
        if (!featureCount) return;

        const {
            boundedSequence,
            activeIndex,
            exitProgress
        } = sequenceState;

        const currentFeature = featureData[activeIndex] || {};
        const nextFeature = featureData[Math.min(activeIndex + 1, featureCount - 1)] || {};

        const currentImage = currentFeature.image || DEFAULT_FEATURE_IMAGE;
        const nextImage = nextFeature.image || DEFAULT_FEATURE_IMAGE;

        if (imageBase.getAttribute("src") !== currentImage) {
            imageBase.src = currentImage;
        }
        imageBase.alt = currentFeature.title || "Noto app interface preview";

        if (featureCount === 1 || activeIndex >= featureCount - 1 || boundedSequence >= 1) {
            imageNext.style.opacity = "0";
            return;
        }

        if (imageNext.getAttribute("src") !== nextImage) {
            imageNext.src = nextImage;
        }
        imageNext.style.opacity = String(easeInOutCubic(exitProgress));
    };

    const setProgressFrame = (sequenceState, options = {}) => {
        if (!featureCount || !progressDotItems.length) return;
        const {
            forceVisible = false,
            fillOverride = null
        } = options;

        const introProgress = forceVisible
            ? 1
            : (sequenceState.activeIndex === 0
            ? sequenceState.enterProgress
            : 1);
        const introEase = easeInOutCubic(introProgress);
        progressRail.style.opacity = String(introEase);
        progressRail.style.transform = `translate(-50%, calc(-50% + ${(1 - introEase) * 10}px))`;

        const fillProgress = fillOverride === null
            ? clamp(
                (sequenceState.activeIndex + sequenceState.enterProgress) / Math.max(featureCount, 1),
                0,
                1
            )
            : clamp(fillOverride, 0, 1);
        progressFill.style.transform = `scaleY(${fillProgress})`;

        if (featureCount === 1) {
            progressDotItems[0]?.classList.add("filled");
            return;
        }

        progressDotItems.forEach((dot, index) => {
            const threshold = (index + 1) / featureCount;
            dot.classList.toggle("filled", fillProgress >= (threshold - 0.001));
        });
    };

    const resetInlineStyles = () => {
        image.style.transform = "";
        imageNext.style.opacity = "";
        progressRail.style.opacity = "";
        progressRail.style.transform = "";
        progressFill.style.transform = "";
        progressDotItems.forEach((dot) => dot.classList.remove("filled"));
        text.style.removeProperty("--feature-preview-balance-shift");
        featureItems.forEach((item) => {
            item.style.opacity = "";
            item.style.transform = "";
            item.style.pointerEvents = "";
        });
        featureLineGroups.forEach((lineGroup) => {
            lineGroup.forEach((line) => {
                line.style.opacity = "";
                line.style.transform = "";
            });
        });
    };

    const applyFinalState = () => {
        const metrics = getLayoutMetrics();
        image.style.transform = `translate3d(${-metrics.finalSlide}px, 0, 0) scale(${metrics.splitScale})`;
        const sequenceState = getSequenceState(1);
        setSequenceFrame(sequenceState);
        setImageFrame(sequenceState);
        setProgressFrame(sequenceState);
    };

    const renderFromStageProgress = (stageProgress) => {
        const progress = clamp(stageProgress, 0, 1);
        const textRevealProgress = getSequenceProgressFromPageProgress(progress);
        const firstBlockPageSpan = TEXT_SEQUENCE_SPAN / Math.max(featureCount, 1);
        const imageProgressStart = Math.max(
            0,
            TEXT_SEQUENCE_START - (firstBlockPageSpan * IMAGE_START_BEFORE_FIRST_BLOCK_SLOTS)
        );
        const imageProgressEnd = Math.min(
            1,
            TEXT_SEQUENCE_START + (firstBlockPageSpan * IMAGE_FINISH_AFTER_FIRST_START_SLOTS)
        );
        const imageSlideProgress = clamp(
            (progress - imageProgressStart) / Math.max(imageProgressEnd - imageProgressStart, 0.0001),
            0,
            1
        );
        const slideEase = easeInOutCubic(imageSlideProgress);
        const metrics = getLayoutMetrics();
        const imageScale =
            metrics.centeredScale + (metrics.splitScale - metrics.centeredScale) * slideEase;
        const imageX = -metrics.finalSlide * slideEase;
        image.style.transform = `translate3d(${imageX}px, 0, 0) scale(${imageScale})`;

        const sequenceState = getSequenceState(textRevealProgress);
        setSequenceFrame(sequenceState);
        setImageFrame(sequenceState);
        setProgressFrame(sequenceState);
    };

    const renderAnimationFrame = (timestamp) => {
        activeAnimationFrame = null;
        if (!featureCount) return;

        const frameMs = lastRenderTimestamp > 0
            ? clamp(timestamp - lastRenderTimestamp, 0.01, 64)
            : 16.67;
        lastRenderTimestamp = timestamp;

        setStageHeight(featureCount || 1);

        if (mobileQuery.matches) {
            dotFocusState = null;
            lastRenderTimestamp = 0;
            resetInlineStyles();
            return;
        }

        if (reducedMotionQuery.matches) {
            dotFocusState = null;
            lastRenderTimestamp = 0;
            applyFinalState();
            return;
        }

        const scrollRange = stage.offsetHeight - window.innerHeight;
        if (scrollRange <= 0) {
            dotFocusState = null;
            lastRenderTimestamp = 0;
            applyFinalState();
            return;
        }

        let focusAnimating = false;
        let focusFillOverride = null;
        if (dotFocusState) {
            const focusElapsed = timestamp - dotFocusState.startTime;
            const focusProgress = clamp(focusElapsed / dotFocusState.durationMs, 0, 1);
            const focusEase = easeInOutCubic(focusProgress);
            const focusFillProgress = clamp(focusElapsed / dotFocusState.progressDurationMs, 0, 1);
            const focusFillEase = easeInOutCubic(focusFillProgress);
            desiredStageProgress = dotFocusState.fromPageProgress
                + ((dotFocusState.toPageProgress - dotFocusState.fromPageProgress) * focusEase);
            focusFillOverride = dotFocusState.fromFill
                + ((dotFocusState.targetFill - dotFocusState.fromFill) * focusFillEase);
            focusAnimating = focusProgress < 1;
            if (!focusAnimating) {
                desiredStageProgress = dotFocusState.toPageProgress;
                focusFillOverride = dotFocusState.targetFill;
                dotFocusState = null;
            }
        }

        let keepAnimating = false;
        if (focusAnimating || focusFillOverride !== null) {
            renderedStageProgress = desiredStageProgress;
            keepAnimating = focusAnimating;
        } else {
            const delta = desiredStageProgress - renderedStageProgress;
            if (Math.abs(delta) > PROGRESS_EPSILON) {
                const frameBlend = 1 - Math.pow(1 - SCROLL_SMOOTHING, frameMs / 16.67);
                renderedStageProgress += delta * frameBlend;
                keepAnimating = true;
            } else {
                renderedStageProgress = desiredStageProgress;
            }
        }

        renderFromStageProgress(renderedStageProgress);
        if (focusFillOverride !== null) {
            const focusSequenceProgress = getSequenceProgressFromPageProgress(renderedStageProgress);
            const focusSequenceState = getSequenceState(focusSequenceProgress);
            setProgressFrame(focusSequenceState, {
                forceVisible: true,
                fillOverride: focusFillOverride
            });
        }

        if (keepAnimating || focusAnimating) {
            startRenderLoop();
        }
    };

    const startRenderLoop = () => {
        if (activeAnimationFrame !== null) return;
        activeAnimationFrame = window.requestAnimationFrame(renderAnimationFrame);
    };

    const requestTick = () => {
        const rawStageProgress = getStageProgressFromViewport();

        if (dotFocusState?.lockInput) {
            startRenderLoop();
            return;
        }

        if (isNavJumpSuppressed()) {
            desiredStageProgress = rawStageProgress;
            startRenderLoop();
            return;
        }

        const canUseFastJump = featureCount > 0
            && !mobileQuery.matches
            && !reducedMotionQuery.matches
            && rawStageProgress >= TEXT_SEQUENCE_START;

        if (canUseFastJump) {
            const jumpThreshold = Math.max(
                FAST_SCROLL_JUMP_MIN_DELTA,
                FAST_SCROLL_JUMP_SLOT_FACTOR / Math.max(featureCount, 1)
            );
            const deltaFromRendered = Math.abs(rawStageProgress - renderedStageProgress);
            const targetIndex = getFeatureIndexFromPageProgress(rawStageProgress);
            const focusTargetIndex = dotFocusState
                ? getFeatureIndexFromPageProgress(dotFocusState.toPageProgress)
                : -1;
            const alreadyFocusingTarget = Boolean(dotFocusState) && !dotFocusState.lockInput && focusTargetIndex === targetIndex;
            const shouldRetargetFocus = Boolean(dotFocusState) && !dotFocusState.lockInput && focusTargetIndex !== targetIndex;
            const shouldStartFastJump = !alreadyFocusingTarget && deltaFromRendered >= jumpThreshold;

            if (shouldRetargetFocus || shouldStartFastJump) {
                const focusTarget = beginManualBlockFocus(targetIndex, {
                    lockInput: false
                });
                if (focusTarget) {
                    const scrollRange = stage.offsetHeight - window.innerHeight;
                    if (scrollRange > 0) {
                        const stageTop = window.scrollY + stage.getBoundingClientRect().top;
                        const targetY = stageTop + (focusTarget.targetPageProgress * scrollRange);
                        window.scrollTo({
                            top: targetY,
                            behavior: "auto"
                        });
                    }
                }
                startRenderLoop();
                return;
            }
        }

        if (!dotFocusState) {
            desiredStageProgress = rawStageProgress;
        }
        startRenderLoop();
    };

    const attachMediaChangeListener = (query, handler) => {
        if (typeof query.addEventListener === "function") {
            query.addEventListener("change", handler);
            return;
        }

        if (typeof query.addListener === "function") {
            query.addListener(handler);
        }
    };

    window.addEventListener("scroll", requestTick, { passive: true });
    window.addEventListener("resize", requestTick);
    attachMediaChangeListener(mobileQuery, requestTick);
    attachMediaChangeListener(reducedMotionQuery, requestTick);

    loadFeatures()
        .then((features) => {
            renderFeatureItems(features);
            requestTick();
        })
        .catch(() => {
            renderFeatureItems(fallbackFeatures);
            requestTick();
        });
});

document.addEventListener("DOMContentLoaded", () => {
    const pricing = document.getElementById("pricing");
    const storyLine1 = document.getElementById("pricing-story-line-1");
    const storyLine2 = document.getElementById("pricing-story-line-2");
    const floatPrice = document.getElementById("pricing-float-price");
    const floatPriceAmount = document.getElementById("pricing-float-price-amount");
    const priceSlot = document.getElementById("pricing-price-slot");
    const pricingNavLink = document.querySelector('.titlebar-links a[href="#pricing"]');

    if (!pricing || !storyLine1 || !storyLine2 || !floatPrice || !floatPriceAmount || !priceSlot) return;

    const revealLines = Array.from(pricing.querySelectorAll(".pricing-reveal-line"));
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const easeInOutCubic = (value) => (value < 0.5
        ? 4 * Math.pow(value, 3)
        : 1 - (Math.pow(-2 * value + 2, 3) / 2));
    const sleep = (durationMs) => new Promise((resolve) => {
        window.setTimeout(resolve, durationMs);
    });
    const formatPrice = (value) => `$${value.toFixed(2)}`;

    const teaserPrice = 5.99;
    const parsedTargetPrice = Number.parseFloat(priceSlot.dataset.targetPrice || "");
    const targetPrice = Number.isFinite(parsedTargetPrice) ? parsedTargetPrice : 1.59;
    const STORY_HOLD_MS = 860;
    const ENTRY_TRIGGER_MARGIN_PX = 80;
    const AUTO_CENTER_DURATION_MS = 540;

    let sequenceStarted = false;
    let sequenceCompleted = false;
    let checkQueued = false;
    let scrollLocked = false;
    let autoCentering = false;
    let lockedScrollY = window.scrollY;
    let lastWindowScrollY = window.scrollY;
    const scrollLockKeys = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Spacebar"]);
    const scrollDownKeys = new Set(["ArrowDown", "PageDown", "End", " ", "Spacebar"]);
    const isNavJumpSuppressed = () => (window.__notoNavJumpLockUntil ?? 0) > performance.now();

    const setStoryLineBaseStyles = (element) => {
        element.classList.remove("is-ellipsis-bounce");
        element.style.opacity = "0";
        element.style.transform = "translate3d(-50%, calc(-50% + 30px), 0) scale(0.96)";
        element.style.filter = "blur(10px)";
    };

    const setPriceAmount = (value) => {
        floatPriceAmount.textContent = formatPrice(value);
    };

    const resetFloatPriceCenter = () => {
        if (floatPrice.parentElement !== pricing) pricing.appendChild(floatPrice);
        floatPrice.style.left = "50%";
        floatPrice.style.top = "50%";
        floatPrice.style.opacity = "0";
        floatPrice.style.transform = "translate3d(-50%, calc(-50% + 24px), 0) scale(0.95)";
        floatPrice.style.filter = "blur(0px)";
        setPriceAmount(teaserPrice);
    };

    const preventScrollInput = (event) => {
        if (!scrollLocked) return;
        event.preventDefault();
        if (autoCentering) return;
        window.scrollTo({ top: lockedScrollY, behavior: "auto" });
    };

    const preventKeyboardScroll = (event) => {
        if (!scrollLocked) return;
        if (!scrollLockKeys.has(event.key)) return;
        event.preventDefault();
        if (autoCentering) return;
        window.scrollTo({ top: lockedScrollY, behavior: "auto" });
    };

    const keepScrollLocked = () => {
        if (!scrollLocked || autoCentering) return;
        if (Math.abs(window.scrollY - lockedScrollY) < 1) return;
        window.scrollTo({ top: lockedScrollY, behavior: "auto" });
    };

    const getPricingCenterScrollY = () => {
        const pricingRect = pricing.getBoundingClientRect();
        const centeredY = window.scrollY + pricingRect.top + (pricingRect.height * 0.5) - (window.innerHeight * 0.5);
        return Math.max(0, centeredY);
    };

    const getElementCenterScrollY = (element) => {
        const rect = element.getBoundingClientRect();
        const centeredY = window.scrollY + rect.top + (rect.height * 0.5) - (window.innerHeight * 0.5);
        const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        return clamp(centeredY, 0, maxScrollY);
    };

    const autoCenterToPricing = async (instant = false) => {
        const startY = window.scrollY;
        const targetY = getPricingCenterScrollY();

        if (instant || Math.abs(targetY - startY) < 1 || reducedMotionQuery.matches) {
            lockedScrollY = targetY;
            window.scrollTo({ top: targetY, behavior: "auto" });
            return;
        }

        autoCentering = true;
        const startTime = performance.now();

        await new Promise((resolve) => {
            const step = (timestamp) => {
                const progress = clamp((timestamp - startTime) / AUTO_CENTER_DURATION_MS, 0, 1);
                const eased = easeInOutCubic(progress);
                const currentY = startY + ((targetY - startY) * eased);
                lockedScrollY = currentY;
                window.scrollTo({ top: currentY, behavior: "auto" });

                if (progress < 1) {
                    window.requestAnimationFrame(step);
                    return;
                }

                lockedScrollY = targetY;
                window.scrollTo({ top: targetY, behavior: "auto" });
                autoCentering = false;
                resolve();
            };

            window.requestAnimationFrame(step);
        });
    };

    const lockScroll = () => {
        if (scrollLocked) return;
        scrollLocked = true;
        lockedScrollY = window.scrollY;
        window.addEventListener("wheel", preventScrollInput, { passive: false });
        window.addEventListener("touchmove", preventScrollInput, { passive: false });
        window.addEventListener("keydown", preventKeyboardScroll, { passive: false });
        window.addEventListener("scroll", keepScrollLocked, { passive: true });
    };

    const unlockScroll = () => {
        if (!scrollLocked) return;
        scrollLocked = false;
        autoCentering = false;
        window.removeEventListener("wheel", preventScrollInput);
        window.removeEventListener("touchmove", preventScrollInput);
        window.removeEventListener("keydown", preventKeyboardScroll);
        window.removeEventListener("scroll", keepScrollLocked);
    };

    const pinPriceToSlot = () => {
        const premiumPriceElement = document.getElementById("premium-price-amount");
        if (premiumPriceElement) {
            premiumPriceElement.style.position = "static";
            premiumPriceElement.textContent = formatPrice(targetPrice);
        }
    };

    const hasPricingEnteredViewport = () => {
        const rect = pricing.getBoundingClientRect();
        return rect.top <= (window.innerHeight + ENTRY_TRIGGER_MARGIN_PX) && rect.bottom >= -ENTRY_TRIGGER_MARGIN_PX;
    };

    const setInitialState = () => {
        pricing.classList.remove("pricing--animating", "pricing--layout-visible", "pricing--done");
        revealLines.forEach((line) => line.classList.remove("is-visible"));
        resetFloatPriceCenter();
        setStoryLineBaseStyles(storyLine1);
        setStoryLineBaseStyles(storyLine2);
    };

    const applyKeyframeEndStyles = (element, keyframes) => {
        const finalKeyframe = keyframes[keyframes.length - 1];
        if (!finalKeyframe) return;
        Object.entries(finalKeyframe).forEach(([property, value]) => {
            if (property === "offset" || property === "easing" || property === "composite") return;
            element.style[property] = String(value);
        });
    };

    const animateElement = (element, keyframes, options) => new Promise((resolve) => {
        if (reducedMotionQuery.matches) {
            applyKeyframeEndStyles(element, keyframes);
            resolve();
            return;
        }

        const animation = element.animate(keyframes, {
            fill: "forwards",
            ...options
        });

        animation.addEventListener("finish", () => {
            applyKeyframeEndStyles(element, keyframes);
            resolve();
        }, { once: true });
    });

    const animateStoryLine = async (element) => {
        await animateElement(
            element,
            [
                {
                    opacity: 0,
                    transform: "translate3d(-50%, calc(-50% + 76px), 0) scale(0.9) rotateX(-9deg)",
                    filter: "blur(14px)"
                },
                {
                    opacity: 1,
                    transform: "translate3d(-50%, calc(-50% - 8px), 0) scale(1.03) rotateX(0deg)",
                    filter: "blur(0px)"
                },
                {
                    opacity: 1,
                    transform: "translate3d(-50%, -50%, 0) scale(1)",
                    filter: "blur(0px)"
                }
            ],
            {
                duration: 860,
                easing: "cubic-bezier(0.16, 1, 0.3, 1)"
            }
        );

        element.classList.add("is-ellipsis-bounce");
        await sleep(STORY_HOLD_MS);
        element.classList.remove("is-ellipsis-bounce");

        await animateElement(
            element,
            [
                {
                    opacity: 1,
                    transform: "translate3d(-50%, -50%, 0) scale(1)",
                    filter: "blur(0px)"
                },
                {
                    opacity: 0.72,
                    transform: "translate3d(-50%, calc(-50% - 30px), 0) scale(0.99)",
                    filter: "blur(2px)"
                },
                {
                    opacity: 0,
                    transform: "translate3d(-50%, calc(-50% - 84px), 0) scale(0.93)",
                    filter: "blur(12px)"
                }
            ],
            {
                duration: 820,
                easing: "cubic-bezier(0.65, 0, 0.82, 0)"
            }
        );
    };

    // Animate the price morphing inside the premium card only
    const animatePriceMorphInCard = () => new Promise((resolve) => {
        const premiumPriceElement = document.getElementById("premium-price-amount");
        if (!premiumPriceElement) {
            resolve();
            return;
        }
        // Get the free card price font size for parity
        const freePrice = document.querySelector('.pricing-card--free .pricing-card-price-amount');
        const staticFontSize = freePrice ? window.getComputedStyle(freePrice).fontSize : window.getComputedStyle(premiumPriceElement).fontSize;
        premiumPriceElement.style.fontSize = staticFontSize;
        premiumPriceElement.style.opacity = "1";
        // Morph the price from teaser to target with custom ease (slow-fast-slow)
        const startTime = performance.now();
        const durationMs = 1800;
        const easeInOutBack = (t) => {
            // Custom ease: slow start, fast middle, slow end
            const c1 = 1.70158;
            const c2 = c1 * 1.525;
            return t < 0.5
                ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
                : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
        };
        const step = (timestamp) => {
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / durationMs, 1);
            const eased = easeInOutBack(progress);
            const currentPrice = teaserPrice + ((targetPrice - teaserPrice) * eased);
            premiumPriceElement.textContent = formatPrice(currentPrice);
            if (progress < 1) {
                window.requestAnimationFrame(step);
                return;
            }
            premiumPriceElement.textContent = formatPrice(targetPrice);
            resolve();
        };
        window.requestAnimationFrame(step);
    });

    const animateFloatPriceMove = (fromX, fromY, toX, toY, fromPrice, toPrice, durationMs) => new Promise((resolve) => {
        const premiumPriceElement = document.getElementById("premium-price-amount");
        
        if (reducedMotionQuery.matches) {
            floatPrice.style.left = `${toX}px`;
            floatPrice.style.top = `${toY}px`;
            floatPrice.style.transform = "translate3d(-50%, -50%, 0) scale(1)";
            setPriceAmount(toPrice);
            if (premiumPriceElement) {
                premiumPriceElement.textContent = formatPrice(toPrice);
            }
            resolve();
            return;
        }

        const startTime = performance.now();

        const step = (timestamp) => {
            const progress = clamp((timestamp - startTime) / durationMs, 0, 1);
            const eased = easeInOutCubic(progress);
            const currentX = fromX + ((toX - fromX) * eased);
            const currentY = fromY + ((toY - fromY) * eased);
            const currentPrice = fromPrice + ((toPrice - fromPrice) * eased);

            floatPrice.style.left = `${currentX.toFixed(2)}px`;
            floatPrice.style.top = `${currentY.toFixed(2)}px`;
            floatPrice.style.transform = "translate3d(-50%, -50%, 0) scale(1)";
            setPriceAmount(currentPrice);
            
            // Also update the premium card's price during animation
            if (premiumPriceElement) {
                premiumPriceElement.textContent = formatPrice(currentPrice);
            }

            if (progress < 1) {
                window.requestAnimationFrame(step);
                return;
            }

            floatPrice.style.left = `${toX}px`;
            floatPrice.style.top = `${toY}px`;
            floatPrice.style.transform = "translate3d(-50%, -50%, 0) scale(1)";
            setPriceAmount(toPrice);
            if (premiumPriceElement) {
                premiumPriceElement.textContent = formatPrice(toPrice);
            }
            resolve();
        };

        window.requestAnimationFrame(step);
    });

    const revealPricingLines = async () => {
        const revealDelay = reducedMotionQuery.matches ? 0 : 210;
        revealLines.forEach((line, index) => {
            window.setTimeout(() => {
                line.classList.add("is-visible");
            }, index * revealDelay);
        });

        const totalDuration = (revealLines.length * revealDelay) + 780;
        await sleep(totalDuration);
    };

    const detachTriggerListeners = () => {
        window.removeEventListener("scroll", queueTriggerCheck);
        window.removeEventListener("resize", queueTriggerCheck);
        window.removeEventListener("wheel", preemptEntryTriggerOnWheel);
        window.removeEventListener("keydown", preemptEntryTriggerOnKeydown);
    };

    const applyFinalState = () => {
        pricing.classList.remove("pricing--animating");
        pricing.classList.add("pricing--layout-visible", "pricing--done");
        revealLines.forEach((line) => line.classList.add("is-visible"));
        sequenceCompleted = true;
        detachTriggerListeners();
        unlockScroll();
    };

    const runPricingSequence = async (options = {}) => {
                        // Card 3D tilt on hover (for both cards)
                        document.querySelectorAll('.pricing-card').forEach(card => {
                            let tiltFrame;
                            card.addEventListener('mousemove', e => {
                                card.classList.add('is-tilted');
                                if (tiltFrame) cancelAnimationFrame(tiltFrame);
                                tiltFrame = requestAnimationFrame(() => {
                                    const rect = card.getBoundingClientRect();
                                    const x = e.clientX - rect.left;
                                    const y = e.clientY - rect.top;
                                    const rotateY = ((x / rect.width) - 0.5) * 18;
                                    const rotateX = ((0.5 - (y / rect.height))) * 12;
                                    card.style.transform = `scale(1.045) perspective(700px) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;
                                });
                            });
                            card.addEventListener('mouseleave', () => {
                                card.classList.remove('is-tilted');
                                card.style.transform = '';
                            });
                        });
        if (sequenceStarted || sequenceCompleted) return;
        const instantStart = Boolean(options.instantStart);
        sequenceStarted = true;
        lockScroll();
        await autoCenterToPricing(instantStart);
        pricing.classList.add("pricing--animating");

        if (reducedMotionQuery.matches) {
            applyFinalState();
            return;
        }

        await animateStoryLine(storyLine1);
        await animateStoryLine(storyLine2);
        pricing.classList.add("pricing--layout-visible");

        // Show the pricing cards container, but hide free card and text
        const pricingLayout = document.querySelector(".pricing-layout");
        const cardsContainer = document.querySelector('.pricing-cards-container');
        const pricingText = document.querySelector('.pricing-text');
        const premiumCard = cardsContainer ? cardsContainer.querySelector('.pricing-card--premium') : null;
        const freeCard = cardsContainer ? cardsContainer.querySelector('.pricing-card--free') : null;
        const textLines = pricingText ? Array.from(pricingText.querySelectorAll('.pricing-reveal-line')) : [];
        if (pricingLayout) {
            pricingLayout.classList.add("pricing-cards-visible");
        }
        // Hide all cards and text lines initially
        if (premiumCard) premiumCard.classList.remove('is-visible');
        if (freeCard) freeCard.classList.remove('is-visible');
        textLines.forEach(line => line.classList.remove('is-visible'));
        // Animate premium card in
        if (premiumCard) {
            await sleep(120);
            premiumCard.classList.add('is-visible');
        }
        // Animate free card in
        if (freeCard) {
            await sleep(220);
            freeCard.classList.add('is-visible');
        }
        // Animate text lines in one by one
        for (let i = 0; i < textLines.length; i++) {
            await sleep(180);
            textLines[i].classList.add('is-visible');
        }
        await revealPricingLines();
        applyFinalState();
    };

    const checkTrigger = () => {
        if (sequenceStarted || sequenceCompleted) return;
        if (isNavJumpSuppressed()) return;
        const currentScrollY = window.scrollY;
        const scrollingDown = currentScrollY > (lastWindowScrollY - 0.5);
        lastWindowScrollY = currentScrollY;
        if (!scrollingDown) return;
        if (!hasPricingEnteredViewport()) return;
        void runPricingSequence();
    };

    const handlePricingNavClick = (event) => {
        event.preventDefault();
        window.__notoNavJumpLockUntil = performance.now() + 1400;

        if (sequenceCompleted) {
            window.scrollTo({
                top: getPricingCenterScrollY(),
                behavior: "auto"
            });
            return;
        }

        if (sequenceStarted) {
            window.scrollTo({ top: lockedScrollY, behavior: "auto" });
            return;
        }

        void runPricingSequence({ instantStart: true });
    };

    function queueTriggerCheck() {
        if (sequenceStarted || sequenceCompleted) return;
        if (checkQueued) return;
        checkQueued = true;
        window.requestAnimationFrame(() => {
            checkQueued = false;
            checkTrigger();
        });
    }

    function preemptEntryTriggerOnWheel(event) {
        if (sequenceStarted || sequenceCompleted || scrollLocked) return;
        if (!event.cancelable) return;
        if (event.deltaY <= 0) return;

        const rect = pricing.getBoundingClientRect();
        const visibleNow = rect.top <= window.innerHeight && rect.bottom >= 0;
        const entersViewportThisWheel = rect.top > window.innerHeight
            && (rect.top - event.deltaY) <= window.innerHeight;
        if (!visibleNow && !entersViewportThisWheel) return;
        event.preventDefault();
        void runPricingSequence();
    }

    function preemptEntryTriggerOnKeydown(event) {
        if (sequenceStarted || sequenceCompleted || scrollLocked) return;
        if (!scrollDownKeys.has(event.key)) return;
        if (!hasPricingEnteredViewport()) return;
        event.preventDefault();
        void runPricingSequence();
    }

    setInitialState();
    lastWindowScrollY = window.scrollY;
    window.addEventListener("scroll", queueTriggerCheck, { passive: true });
    window.addEventListener("resize", queueTriggerCheck);
    window.addEventListener("wheel", preemptEntryTriggerOnWheel, { passive: false });
    window.addEventListener("keydown", preemptEntryTriggerOnKeydown, { passive: false });
    pricingNavLink?.addEventListener("click", handlePricingNavClick);
    queueTriggerCheck();
});
