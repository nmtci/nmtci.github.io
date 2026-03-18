const CONFIG = {
    itemsPerLoad: 50,
    storageKeys: {
        settings: "reader-settings",
        lastRead: "nmtci-last-read",
        pwaDismissed: "pwa-install-dismissed",
    },
    themes: {
        light: { bg: "#fdfdfd", text: "#333333" },
        sepia: { bg: "#f4ecd8", text: "#5b4636" },
        dark: { bg: "#222222", text: "#d1d1d1" },
        midnight: { bg: "#2b323b", text: "#c4cdd5" },
        forest: { bg: "#e8f5e9", text: "#2d3b2d" },
        amoled: { bg: "#000000", text: "#b3b3b3" },
    },
};

const DOM = {
    root: document.documentElement,
    settingsMenu: document.getElementById("settingsMenu"),
    toggleSettingsBtn: document.getElementById("toggleSettings"),
    themeBtns: document.querySelectorAll(".theme-btn"),
    resumeBtn: document.getElementById("resumeBtn"),
    resumeDisplay: document.getElementById("resumeChapterDisplay"),
    chapterList: document.getElementById("chapterList"),

    searchInput: document.getElementById("searchInput"),
    sortBtn: document.getElementById("sortBtn"),
    sortLabel: document.getElementById("sortLabel"),
    firstChapterBtn: document.getElementById("firstChapterBtn"),
    latestChapterBtn: document.getElementById("latestChapterBtn"),

    latestUpdatesPanel: document.getElementById("latestUpdatesPanel"),
    latestList: document.getElementById("latestList"),

    bookDescription: document.getElementById("bookDescription"),
    toggleSynopsisBtn: document.getElementById("toggleSynopsisBtn"),

    installFab: document.getElementById("installFab"),
    installMenu: document.getElementById("installMenu"),
    installAction: document.getElementById("pwaInstallAction"),
    dismissAction: document.getElementById("pwaDismissAction"),
};

const ThemeManager = {
    init() {
        this.load();
        this.bindEvents();
    },
    bindEvents() {
        DOM.toggleSettingsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            DOM.settingsMenu.classList.toggle("active");
        });
        document.addEventListener("click", (e) => {
            if (
                DOM.settingsMenu.classList.contains("active") &&
                !DOM.settingsMenu.contains(e.target)
            ) {
                DOM.settingsMenu.classList.remove("active");
            }
        });
        DOM.settingsMenu.addEventListener("click", (e) => e.stopPropagation());
        DOM.themeBtns.forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const themeName = e.target.dataset.theme;
                this.apply(themeName);
                this.save();
            });
        });
    },
    apply(themeName) {
        const theme = CONFIG.themes[themeName] || CONFIG.themes.light;
        DOM.root.style.setProperty("--bg-color", theme.bg);
        DOM.root.style.setProperty("--text-color", theme.text);
        DOM.root.setAttribute("data-theme", themeName);
        const metaThemeColor = document.querySelector(
            'meta[name="theme-color"]',
        );
        if (metaThemeColor) metaThemeColor.setAttribute("content", theme.bg);
        DOM.themeBtns.forEach((btn) => {
            if (btn.dataset.theme === themeName) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
    },
    load() {
        const savedSettings = localStorage.getItem(CONFIG.storageKeys.settings);
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            if (settings.fontFamily) {
                DOM.root.style.setProperty(
                    "--font-family",
                    settings.fontFamily,
                );
            }
            this.apply(settings.theme || "light");
        } else {
            this.apply("light");
        }
    },
    save() {
        const savedRaw = localStorage.getItem(CONFIG.storageKeys.settings);
        let settings = savedRaw
            ? JSON.parse(savedRaw)
            : { fontSize: 18, lineHeight: 1.6 };
        const activeBtn = document.querySelector(".theme-btn.active");
        settings.theme = activeBtn ? activeBtn.dataset.theme : "light";
        localStorage.setItem(
            CONFIG.storageKeys.settings,
            JSON.stringify(settings),
        );
    },
};

const ResumeManager = {
    init() {
        try {
            const lastRead = JSON.parse(
                localStorage.getItem(CONFIG.storageKeys.lastRead),
            );
            if (lastRead && lastRead.url) {
                DOM.resumeBtn.href = lastRead.url;
                let chapterText =
                    lastRead.id !== null && lastRead.id !== undefined
                        ? `Ch. ${lastRead.id}`
                        : "Unknown Chapter";
                if (lastRead.title) {
                    chapterText += `: ${lastRead.title}`;
                }
                DOM.resumeDisplay.textContent = chapterText;
                DOM.resumeBtn.classList.remove("resume-hidden");
            }
        } catch (e) {
            console.error("Error reading history", e);
        }
    },
};

const ContentManager = {
    chapters: [],
    filteredChapters: [],
    observer: null,
    sentinel: null,

    state: {
        sortDesc: false,
        searchQuery: "",
        renderedCount: 0,
    },

    async init() {
        try {
            const response = await fetch("chapters.json");
            if (!response.ok)
                throw new Error(`HTTP error! Status: ${response.status}`);

            this.chapters = await response.json();
            this.chapters.sort((a, b) => a.id - b.id);

            this.renderLatest();
            this.updateNavButtons();
            this.initObserver();
            this.refreshDataSource();
        } catch (error) {
            console.error("Unable to fetch data:", error);
            DOM.chapterList.innerHTML = `<li class="error-state">Error loading chapters.</li>`;
        }
    },

    bindEvents() {
        DOM.searchInput.addEventListener("input", (e) => {
            this.state.searchQuery = e.target.value.trim();
            this.refreshDataSource();
        });

        DOM.sortBtn.addEventListener("click", () => {
            this.state.sortDesc = !this.state.sortDesc;
            DOM.sortLabel.textContent = this.state.sortDesc
                ? "Newest First"
                : "Oldest First";
            this.refreshDataSource();
        });
    },

    updateNavButtons() {
        if (this.chapters.length > 0) {
            DOM.firstChapterBtn.href = this.chapters[0].url;
            DOM.latestChapterBtn.href =
                this.chapters[this.chapters.length - 1].url;
        } else {
            DOM.firstChapterBtn.classList.add("disabled");
            DOM.latestChapterBtn.classList.add("disabled");
        }
    },

    initObserver() {
        const options = {
            root: null,
            rootMargin: "200px",
            threshold: 0.1,
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    this.loadMore();
                }
            });
        }, options);

        this.sentinel = document.createElement("div");
        this.sentinel.className = "sentinel";
        this.sentinel.style.height = "1px";
        this.sentinel.style.width = "100%";
    },

    refreshDataSource() {
        if (this.state.searchQuery) {
            const q = this.state.searchQuery.toLowerCase();
            this.filteredChapters = this.chapters.filter(
                (ch) =>
                    ch.id.toString().includes(q) ||
                    ch.title.toLowerCase().includes(q),
            );
        } else {
            this.filteredChapters = [...this.chapters];
        }

        this.filteredChapters.sort((a, b) =>
            this.state.sortDesc ? b.id - a.id : a.id - b.id,
        );

        DOM.chapterList.innerHTML = "";
        this.state.renderedCount = 0;

        if (this.filteredChapters.length === 0) {
            DOM.chapterList.innerHTML = `<li class="empty-state">No chapters found.</li>`;
        } else {
            this.loadMore();

            const container = document.getElementById("toc-container");
            if (!container.contains(this.sentinel)) {
                container.appendChild(this.sentinel);
            }
            this.observer.observe(this.sentinel);
        }
    },

    loadMore() {
        if (this.state.renderedCount >= this.filteredChapters.length) {
            this.observer.unobserve(this.sentinel);
            return;
        }

        const start = this.state.renderedCount;
        const end = Math.min(
            start + CONFIG.itemsPerLoad,
            this.filteredChapters.length,
        );

        const chunk = this.filteredChapters.slice(start, end);
        const fragment = document.createDocumentFragment();

        chunk.forEach((ch) => {
            const li = document.createElement("li");
            li.className = "chapter-item";
            li.innerHTML = `
                <a href="${ch.url}">
                    <span class="chapter-num">Ch. ${ch.id}</span>
                    <span class="chapter-title">${ch.title}</span>
                </a>`;
            fragment.appendChild(li);
        });

        DOM.chapterList.appendChild(fragment);
        this.state.renderedCount = end;

        if (this.state.renderedCount >= this.filteredChapters.length) {
            this.observer.unobserve(this.sentinel);
        }
    },

    renderLatest() {
        if (!this.chapters || this.chapters.length === 0) {
            DOM.latestUpdatesPanel.classList.add("hidden-empty");
            return;
        }

        DOM.latestUpdatesPanel.classList.remove("hidden-empty");

        const latestCount = 3;
        const latestChapters = this.chapters.slice(-latestCount).reverse();

        DOM.latestList.innerHTML = latestChapters
            .map((ch, index) => {
                const badge =
                    index === 0 ? `<span class="new-badge">New</span>` : "";
                return `
                <a href="${ch.url}" class="latest-item">
                    <div class="latest-meta">
                        <span class="latest-chapter-num">Chapter ${ch.id}</span>
                        <span class="latest-chapter-title">${ch.title}</span>
                    </div>
                    ${badge}
                </a>
            `;
            })
            .join("");
    },
};

const PWAManager = {
    deferredPrompt: null,
    init() {
        if (!DOM.installFab) return;
        const isDismissed =
            localStorage.getItem(CONFIG.storageKeys.pwaDismissed) === "true";
        window.addEventListener("beforeinstallprompt", (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            if (!isDismissed) DOM.installFab.style.display = "flex";
        });
        this.bindEvents();
    },
    bindEvents() {
        DOM.installFab.addEventListener("click", (e) => {
            e.stopPropagation();
            DOM.installMenu.classList.toggle("active");
            DOM.settingsMenu.classList.remove("active");
        });
        document.addEventListener("click", (e) => {
            if (
                DOM.installMenu &&
                DOM.installMenu.classList.contains("active") &&
                !DOM.installMenu.contains(e.target)
            ) {
                DOM.installMenu.classList.remove("active");
            }
        });
        if (DOM.installAction) {
            DOM.installAction.addEventListener("click", async () => {
                if (!this.deferredPrompt) return;
                DOM.installMenu.classList.remove("active");
                this.deferredPrompt.prompt();
                const { outcome } = await this.deferredPrompt.userChoice;
                this.deferredPrompt = null;
                if (outcome === "accepted")
                    DOM.installFab.style.display = "none";
            });
        }
        if (DOM.dismissAction) {
            DOM.dismissAction.addEventListener("click", () => {
                DOM.installMenu.classList.remove("active");
                DOM.installFab.style.display = "none";
                localStorage.setItem(CONFIG.storageKeys.pwaDismissed, "true");
                alert("Button hidden. You can install later via browser menu.");
            });
        }
    },
};

const SynopsisManager = {
    init() {
        if (!DOM.bookDescription || !DOM.toggleSynopsisBtn) return;

        DOM.bookDescription.classList.add("collapsed");

        DOM.toggleSynopsisBtn.addEventListener("click", () => {
            const isCollapsed =
                DOM.bookDescription.classList.contains("collapsed");

            if (isCollapsed) {
                DOM.bookDescription.classList.remove("collapsed");
                DOM.toggleSynopsisBtn.textContent = "Show Less";
            } else {
                DOM.bookDescription.classList.add("collapsed");
                DOM.toggleSynopsisBtn.textContent = "Show More";
                DOM.bookDescription.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
            }
        });
    },
};

document.addEventListener("DOMContentLoaded", () => {
    ThemeManager.init();
    ResumeManager.init();
    ContentManager.init();
    ContentManager.bindEvents();
    PWAManager.init();
    SynopsisManager.init();
});
