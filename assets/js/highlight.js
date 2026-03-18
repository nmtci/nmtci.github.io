const HighlightManager = {
    state: {
        toolbar: null,
        activeRange: null,
        activeId: null,
        storageKey: "",
        selectionTimer: null,
        isPointerDown: false,
    },

    config: {
        allowedColors: new Set(["yellow", "green", "blue", "red"]),
        storagePrefix: "nmtci-highlights-",
        selectors: {
            content:
                (typeof CONFIG !== "undefined" &&
                    CONFIG.selectors?.contentDiv) ||
                "#content",
            paragraphs:
                (typeof CONFIG !== "undefined" &&
                    CONFIG.selectors?.paragraphs) ||
                "p",
            toolbar: "#highlight-toolbar",
            noteOverlay: "#noteOverlay",
            overviewOverlay: "#overviewOverlay",
            settingsMenu: "#settingsMenu",
            noteInput: "#noteInput",
            noteSaveBtn: "#saveNote",
            noteCancelBtn: "#cancelNote",
            overviewContent: "#overviewContent",
            overviewCloseBtn: "#closeOverview",
            overviewToggleBtn: "#toggleHighlightsList",
            overviewSearch: "#overviewSearch",
            overviewSort: ".sort-btn",
            overviewSortActive: ".sort-btn.active",
        },
    },

    init() {
        const path = window.location.pathname.replace(/\/$/, "");
        this.state.storageKey = `${this.config.storagePrefix}${path}`;

        this.state.toolbar = document.querySelector(
            this.config.selectors.toolbar,
        );

        if (!this.state.toolbar) {
            console.warn("HighlightManager: Toolbar element not found.");
            return;
        }

        this._restoreHighlightsFromStorage();
        this._bindAllEvents();
        this._handleDeepLink();
    },

    _bindAllEvents() {
        this._bindSelectionEvents();
        this._bindToolbarEvents();
        this._bindContentEvents();
        this._bindModalEvents();
        this._bindOverviewEvents();
    },

    _bindSelectionEvents() {
        const setPointerUp = () => {
            this.state.isPointerDown = false;
        };

        document.addEventListener("pointerdown", (e) => {
            this.state.isPointerDown = true;

            const isToolbar = e.target.closest(this.config.selectors.toolbar);
            const isModal = e.target.closest(this.config.selectors.noteOverlay);

            if (!isToolbar && !isModal && this.state.toolbar) {
                this.state.toolbar.style.display = "none";
            }
        });

        const handleDebouncedSelection = () => {
            if (
                document
                    .querySelector(this.config.selectors.noteOverlay)
                    ?.classList.contains("active")
            ) {
                return;
            }

            const selection = document.getSelection();
            let isInsideActive = false;

            if (this.state.activeId && selection.anchorNode) {
                const node =
                    selection.anchorNode.nodeType === 3
                        ? selection.anchorNode.parentElement
                        : selection.anchorNode;

                const hl = node.closest(".highlight");
                if (hl && hl.dataset.id === this.state.activeId) {
                    isInsideActive = true;
                }
            }

            if (!isInsideActive && this.state.toolbar) {
                this.state.toolbar.style.display = "none";
            }

            if (this.state.selectionTimer)
                clearTimeout(this.state.selectionTimer);

            this.state.selectionTimer = setTimeout(() => {
                if (this.state.isPointerDown) return;

                const selection = document.getSelection();
                const anchor = selection.anchorNode;

                const targetNode =
                    anchor && anchor.nodeType === 3
                        ? anchor.parentElement
                        : anchor;

                this._handleSelectionChange({
                    target: targetNode,
                });
            }, 300);
        };

        document.addEventListener("selectionchange", handleDebouncedSelection);

        const onPointerUp = (e) => {
            setPointerUp();

            const isToolbar =
                e.target.closest &&
                e.target.closest(this.config.selectors.toolbar);
            const isModal =
                e.target.closest &&
                e.target.closest(this.config.selectors.noteOverlay);

            if (isToolbar || isModal) return;

            setTimeout(() => this._handleSelectionChange(e), 20);
        };

        document.addEventListener("pointerup", onPointerUp);
        document.addEventListener("touchend", onPointerUp);

        document.addEventListener("contextmenu", () => {
            setPointerUp();
            setTimeout(() => this._handleSelectionChange({}), 100);
        });
    },

    _bindToolbarEvents() {
        this.state.toolbar.addEventListener("pointerdown", (e) =>
            e.preventDefault(),
        );

        this.state.toolbar.addEventListener("click", (e) => {
            e.stopPropagation();
            const btn = e.target.closest("button");
            if (!btn) return;

            if (btn.classList.contains("delete-btn")) {
                this.removeHighlight(this.state.activeId);
            } else if (btn.classList.contains("note-btn")) {
                this.ui.openNoteModal(this);
            } else if (btn.dataset.color) {
                this.createHighlight(btn.dataset.color);
            }
        });
    },

    _bindContentEvents() {
        const contentDiv = document.querySelector(
            this.config.selectors.content,
        );
        if (!contentDiv) return;

        contentDiv.addEventListener("click", (e) => {
            const highlightSpan = e.target.closest(".highlight");
            if (highlightSpan) {
                this._activateEditMode(highlightSpan);
            }
        });
    },

    _bindOverlayClose(overlaySelector, closeBtnSelector, onCloseCallback) {
        const overlay = document.querySelector(overlaySelector);
        const closeBtn = document.querySelector(closeBtnSelector);

        if (!overlay) return;

        const closeHandler = () => onCloseCallback();

        if (closeBtn) closeBtn.addEventListener("click", closeHandler);

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeHandler();
        });
    },

    _bindModalEvents() {
        this._bindOverlayClose(
            this.config.selectors.noteOverlay,
            this.config.selectors.noteCancelBtn,
            () => this.ui.closeNoteModal(this),
        );

        const saveBtn = document.querySelector(
            this.config.selectors.noteSaveBtn,
        );
        if (saveBtn) saveBtn.onclick = () => this._saveNoteFromModal();

        const noteInput = document.querySelector(
            this.config.selectors.noteInput,
        );
        if (noteInput) {
            noteInput.addEventListener("keydown", (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    this._saveNoteFromModal();
                }
            });
        }
    },

    _bindOverviewEvents() {
        this._bindOverlayClose(
            this.config.selectors.overviewOverlay,
            this.config.selectors.overviewCloseBtn,
            () => this.ui.closeOverviewModal(this),
        );

        const openBtn = document.querySelector(
            this.config.selectors.overviewToggleBtn,
        );
        if (openBtn) {
            openBtn.addEventListener("click", () => {
                document
                    .querySelector(this.config.selectors.settingsMenu)
                    ?.classList.remove("active");
                this.ui.openOverviewModal(this);
            });
        }

        const searchInput = document.querySelector(
            this.config.selectors.overviewSearch,
        );
        const sortBtns = document.querySelectorAll(
            this.config.selectors.overviewSort,
        );

        const handleUpdate = () => {
            this.ui.updateOverviewList(this);
        };

        if (searchInput) searchInput.addEventListener("input", handleUpdate);
        if (sortBtns) {
            sortBtns.forEach((btn) => {
                btn.addEventListener("click", (e) => {
                    sortBtns.forEach((b) => b.classList.remove("active"));
                    e.currentTarget.classList.add("active");
                    handleUpdate();
                });
            });
        }

        const overviewContent = document.querySelector(
            this.config.selectors.overviewContent,
        );
        if (overviewContent) {
            overviewContent.addEventListener("click", (e) => {
                const btn = e.target.closest(".icon-btn.copy-btn");
                if (btn) {
                    const item = btn.closest(".hl-item");
                    const quoteEl = item.querySelector(".hl-quote");
                    let text = quoteEl.textContent.trim();

                    if (navigator.clipboard) {
                        navigator.clipboard
                            .writeText(text)
                            .then(() => {
                                btn.classList.add("copied");
                                setTimeout(
                                    () => btn.classList.remove("copied"),
                                    2000,
                                );
                            })
                            .catch(console.error);
                    }
                    return;
                }

                const deleteBtn = e.target.closest(".icon-btn.delete-btn");
                if (deleteBtn) {
                    if (
                        !confirm(
                            "Are you sure you want to delete this highlight?",
                        )
                    )
                        return;

                    const id = deleteBtn.dataset.id;
                    const key = deleteBtn.dataset.key;

                    if (key === this.state.storageKey) {
                        this.removeHighlight(id);
                    } else {
                        this.storage.delete(key, id);
                    }

                    const allData = this.storage.getAllGlobal(
                        this.config.storagePrefix,
                    );
                    const content = document.querySelector(
                        this.config.selectors.overviewContent,
                    );
                    this.ui.updateOverviewList(this);
                }
            });
        }
    },

    createHighlight(color) {
        if (!this.config.allowedColors.has(color)) {
            console.error(`Invalid color: ${color}`);
            return null;
        }

        if (!this.state.activeRange && this.state.activeId) {
            return this._updateHighlightColor(color);
        }

        if (this.state.activeRange && !this.state.activeRange.collapsed) {
            return this._createNewHighlight(color);
        }

        return null;
    },

    removeHighlight(id) {
        if (!id) return;

        const spans = this.dom.getHighlightElement(id);
        spans.forEach((span) => {
            const parent = span.parentNode;
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            parent.removeChild(span);
            parent.normalize();
        });

        this.storage.delete(this.state.storageKey, id);

        this._finishAction();
        this.state.activeId = null;
    },

    _updateHighlightColor(color) {
        const spans = this.dom.getHighlightElement(this.state.activeId);
        spans.forEach((span) => {
            span.classList.forEach((cls) => {
                if (cls.startsWith("highlight-") && cls !== "highlight") {
                    span.classList.remove(cls);
                }
            });
            span.classList.add(`highlight-${color}`);
        });

        this.storage.update(this.state.storageKey, this.state.activeId, {
            color,
        });

        this._finishAction();
        return this.state.activeId;
    },

    _createNewHighlight(color) {
        const range = this.state.activeRange;

        const id = crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).substr(2);

        if (!range.commonAncestorContainer.isConnected) {
            this._finishAction();
            return null;
        }

        const context = this.dom.getSelectionContext(
            range,
            this.config.selectors.paragraphs,
        );

        if (!context) {
            this._finishAction();
            return null;
        }

        const { startPIndex, endPIndex } = context;
        const allPs = document.querySelectorAll(
            this.config.selectors.paragraphs,
        );

        let fullText = "";
        let globalStartOffset = 0;
        let globalEndOffset = 0;

        for (let i = startPIndex; i <= endPIndex; i++) {
            const p = allPs[i];
            let start = 0;
            let end = p.textContent.length;

            if (i === startPIndex) {
                const preCaretRange = document.createRange();
                preCaretRange.selectNodeContents(p);
                preCaretRange.setEnd(range.startContainer, range.startOffset);
                start = preCaretRange.toString().length;
            }
            if (i === endPIndex) {
                const preCaretRange = document.createRange();
                preCaretRange.selectNodeContents(p);
                preCaretRange.setEnd(range.endContainer, range.endOffset);
                end = preCaretRange.toString().length;
            }

            if (
                this.dom.checkOverlap(
                    i,
                    start,
                    end,
                    this.storage.get(this.state.storageKey),
                )
            ) {
                console.warn(`Overlap detected in paragraph ${i}, aborting.`);
                this._finishAction();
                return null;
            }
        }

        for (let i = startPIndex; i <= endPIndex; i++) {
            const p = allPs[i];
            let start = 0;
            let end = p.textContent.length;

            if (i === startPIndex) {
                const preCaretRange = document.createRange();
                preCaretRange.selectNodeContents(p);
                preCaretRange.setEnd(range.startContainer, range.startOffset);
                start = preCaretRange.toString().length;
                globalStartOffset = start;
            }

            if (i === endPIndex) {
                const preCaretRange = document.createRange();
                preCaretRange.selectNodeContents(p);
                preCaretRange.setEnd(range.endContainer, range.endOffset);
                end = preCaretRange.toString().length;
                globalEndOffset = end;
            }

            if (fullText.length > 0) fullText += " ";
            fullText += p.textContent.substring(start, end);

            this.dom.restoreHighlightDOM(p, {
                id,
                color,
                start,
                end,
            });
        }

        this.storage.save(this.state.storageKey, {
            id,
            startPIndex,
            endPIndex,
            startOffset: globalStartOffset,
            endOffset: globalEndOffset,
            text: fullText,
            color,
            note: "",
            pageTitle:
                typeof CHAPTER_TITLE !== "undefined"
                    ? CHAPTER_TITLE
                    : document.title,
            chapterNum: typeof CHAPTER_NUM !== "undefined" ? CHAPTER_NUM : null,
            createdAt: Date.now(),
        });

        this._finishAction();
        return id;
    },

    _saveNoteFromModal() {
        const input = document.querySelector(this.config.selectors.noteInput);
        const text = input ? input.value : "";

        if (!this.state.activeId && this.state.activeRange) {
            this.state.activeId = this.createHighlight("yellow");
        }

        if (this.state.activeId) {
            this.storage.update(this.state.storageKey, this.state.activeId, {
                note: text,
            });

            const spans = this.dom.getHighlightElement(this.state.activeId);

            if (spans.length > 0) {
                spans.forEach((span, index) => {
                    span.dataset.note = text;

                    if (text.trim()) {
                        span.classList.add("has-note");
                        if (index === spans.length - 1) {
                            span.classList.add("has-note-icon");
                        } else {
                            span.classList.remove("has-note-icon");
                        }
                    } else {
                        span.classList.remove("has-note", "has-note-icon");
                    }
                });
            }
        }

        this.ui.closeNoteModal(this);
    },

    _handleSelectionChange(e) {
        const selection = window.getSelection();

        if (selection.isCollapsed) {
            if (!e.target || !e.target.closest?.(".highlight")) {
                this.state.toolbar.style.display = "none";
                this.state.activeId = null;
            }
            return;
        }

        const range = selection.getRangeAt(0);
        const contentDiv = document.querySelector(
            this.config.selectors.content,
        );

        if (
            !contentDiv ||
            !contentDiv.contains(range.commonAncestorContainer)
        ) {
            this.state.toolbar.style.display = "none";
            return;
        }

        const context = this.dom.getSelectionContext(
            range,
            this.config.selectors.paragraphs,
        );

        if (!context) {
            this.state.toolbar.style.display = "none";
            return;
        }

        this.state.activeRange = range;
        this.state.activeId = null;
        this.state.toolbar.classList.remove("edit-mode");

        this.ui.positionToolbar(
            this.state.toolbar,
            range.getBoundingClientRect(),
        );
    },

    _activateEditMode(span) {
        this.state.activeId = span.dataset.id;
        this.state.activeRange = null;
        this.state.toolbar.classList.add("edit-mode");

        this.ui.positionToolbar(
            this.state.toolbar,
            span.getBoundingClientRect(),
        );
    },

    _finishAction() {
        window.getSelection().removeAllRanges();
        this.state.toolbar.style.display = "none";
        this.state.activeRange = null;
    },

    _restoreHighlightsFromStorage() {
        const list = this.storage.get(this.state.storageKey);
        const allPs = document.querySelectorAll(
            this.config.selectors.paragraphs,
        );

        list.forEach((item) => {
            const startIdx =
                item.startPIndex !== undefined ? item.startPIndex : item.pIndex;
            const endIdx =
                item.endPIndex !== undefined ? item.endPIndex : item.pIndex;

            for (let i = startIdx; i <= endIdx; i++) {
                const p = allPs[i];
                if (!p) continue;

                let start = 0;
                let end = p.textContent.length;

                if (i === startIdx) {
                    start =
                        item.startOffset !== undefined
                            ? item.startOffset
                            : item.start;
                }

                if (i === endIdx) {
                    end =
                        item.endOffset !== undefined
                            ? item.endOffset
                            : item.end;
                }

                this.dom.restoreHighlightDOM(p, {
                    id: item.id,
                    color: item.color,
                    note: item.note,
                    start: start,
                    end: end,
                });
            }

            if (item.note) {
                const segments = this.dom.getHighlightElement(item.id);
                if (segments.length > 0) {
                    segments[segments.length - 1].classList.add(
                        "has-note-icon",
                    );
                }
            }
        });
    },

    _handleDeepLink() {
        const hash = window.location.hash;
        if (!hash) return;

        const id = hash.slice(1);

        const elements = this.dom.getHighlightElement(id);

        if (elements.length > 0) {
            setTimeout(() => {
                elements[0].scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                });
            }, 100);
        }
    },

    dom: {
        getHighlightElement(id) {
            return document.querySelectorAll(`.highlight[data-id="${id}"]`);
        },

        getSelectionContext(range, pSelector) {
            const startNode =
                range.startContainer.nodeType === 3
                    ? range.startContainer.parentElement
                    : range.startContainer;
            const endNode =
                range.endContainer.nodeType === 3
                    ? range.endContainer.parentElement
                    : range.endContainer;

            const startP = startNode.closest(pSelector);
            const endP = endNode.closest(pSelector);

            if (!startP || !endP) return null;

            const allPs = Array.from(document.querySelectorAll(pSelector));
            const startPIndex = allPs.indexOf(startP);
            const endPIndex = allPs.indexOf(endP);

            if (startPIndex === -1 || endPIndex === -1) return null;

            return {
                startPIndex: Math.min(startPIndex, endPIndex),
                endPIndex: Math.max(startPIndex, endPIndex),
            };
        },

        calculateOffsets(range, p) {
            const preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(p);
            preCaretRange.setEnd(range.startContainer, range.startOffset);
            const start = preCaretRange.toString().length;
            return { start, end: start + range.toString().length };
        },

        checkOverlap(pIndex, reqStart, reqEnd, existingHighlights) {
            return existingHighlights.some((h) => {
                const hStartP =
                    h.startPIndex !== undefined ? h.startPIndex : h.pIndex;
                const hEndP =
                    h.endPIndex !== undefined ? h.endPIndex : h.pIndex;

                if (pIndex < hStartP || pIndex > hEndP) return false;

                let existingStartInThisPara = 0;
                let existingEndInThisPara = Number.MAX_SAFE_INTEGER;

                if (pIndex === hStartP) {
                    existingStartInThisPara =
                        h.startOffset !== undefined ? h.startOffset : h.start;
                }

                if (pIndex === hEndP) {
                    existingEndInThisPara =
                        h.endOffset !== undefined ? h.endOffset : h.end;
                }

                return (
                    reqStart < existingEndInThisPara &&
                    reqEnd > existingStartInThisPara
                );
            });
        },

        wrapRange(range, id, color) {
            const fragment = range.cloneContents();
            if (
                fragment.querySelector(
                    "p, div, article, section, h1, h2, h3, li",
                )
            ) {
                console.error("Cannot highlight block-level elements.");
                return false;
            }

            const span = document.createElement("span");
            span.className = `highlight highlight-${color}`;
            span.dataset.id = id;

            try {
                const extracted = range.extractContents();
                span.appendChild(extracted);
                range.insertNode(span);
                span.parentElement.normalize();
                return true;
            } catch (e) {
                console.error("DOM wrap failed:", e);
                return false;
            }
        },

        restoreHighlightDOM(p, item) {
            const treeWalker = document.createTreeWalker(
                p,
                NodeFilter.SHOW_TEXT,
            );
            let currentNode = treeWalker.nextNode();
            let currentOffset = 0;
            let startNode = null,
                startPos = 0;
            let endNode = null,
                endPos = 0;

            while (currentNode) {
                const len = currentNode.length;

                if (!startNode && currentOffset + len >= item.start) {
                    startNode = currentNode;
                    startPos = item.start - currentOffset;
                }
                if (!endNode && currentOffset + len >= item.end) {
                    endNode = currentNode;
                    endPos = item.end - currentOffset;
                    break;
                }
                currentOffset += len;
                currentNode = treeWalker.nextNode();
            }

            if (startNode && endNode) {
                const range = document.createRange();
                try {
                    range.setStart(startNode, startPos);
                    range.setEnd(endNode, endPos);

                    const span = document.createElement("span");
                    span.className = `highlight highlight-${item.color} ${item.note ? "has-note" : ""}`;

                    span.dataset.id = item.id;
                    if (item.note) span.dataset.note = item.note;

                    span.appendChild(range.extractContents());
                    range.insertNode(span);
                } catch (e) {
                    console.error("Restore failed", e);
                }
            }
        },
    },

    ui: {
        positionToolbar(toolbar, rect) {
            toolbar.style.display = "flex";
            const virtualRef = { getBoundingClientRect: () => rect };

            const { computePosition, flip, shift, offset } =
                window.FloatingUIDOM;

            computePosition(virtualRef, toolbar, {
                placement: "bottom",
                middleware: [offset(10), flip(), shift({ padding: 5 })],
            }).then(({ x, y }) => {
                Object.assign(toolbar.style, {
                    left: `${x}px`,
                    top: `${y}px`,
                    position: "absolute",
                    transform: "",
                });
            });
        },

        openNoteModal(manager) {
            const modal = document.querySelector(
                manager.config.selectors.noteOverlay,
            );
            const input = document.querySelector(
                manager.config.selectors.noteInput,
            );
            let currentNote = "";

            if (manager.state.activeId) {
                const data = manager.storage.getById(
                    manager.state.storageKey,
                    manager.state.activeId,
                );
                if (data) currentNote = data.note || "";
            }

            input.value = currentNote;
            modal.classList.add("active");
            setTimeout(() => input.focus(), 50);
        },

        closeNoteModal(manager) {
            document
                .querySelector(manager.config.selectors.noteOverlay)
                .classList.remove("active");
            manager._finishAction();
        },

        openOverviewModal(manager) {
            const overlay = document.querySelector(
                manager.config.selectors.overviewOverlay,
            );
            const searchInput = document.querySelector(
                manager.config.selectors.overviewSearch,
            );
            const sortSelect = document.querySelector(
                manager.config.selectors.overviewSort,
            );
            if (searchInput) searchInput.value = "";
            if (sortSelect) sortSelect.value = "chapter";

            this.updateOverviewList(manager);
            overlay.classList.add("active");
        },

        updateOverviewList(manager) {
            const content = document.querySelector(
                manager.config.selectors.overviewContent,
            );
            const searchInput = document.querySelector(
                manager.config.selectors.overviewSearch,
            );
            const activeSortBtn = document.querySelector(
                manager.config.selectors.overviewSortActive,
            );

            const query = searchInput ? searchInput.value.toLowerCase() : "";
            const sortMode = activeSortBtn
                ? activeSortBtn.dataset.value
                : "chapter";

            let rawData = manager.storage.getAllGlobal(
                manager.config.storagePrefix,
            );

            let processedData = [];

            if (sortMode === "chapter") {
                processedData = rawData
                    .map((chapter) => {
                        const filtered = chapter.highlights.filter(
                            (hl) =>
                                (hl.text &&
                                    hl.text.toLowerCase().includes(query)) ||
                                (hl.note &&
                                    hl.note.toLowerCase().includes(query)),
                        );
                        return { ...chapter, highlights: filtered };
                    })
                    .filter((ch) => ch.highlights.length > 0);
            } else {
                let allHighlights = [];

                rawData.forEach((chapter) => {
                    chapter.highlights.forEach((hl) => {
                        if (
                            (!hl.text ||
                                !hl.text.toLowerCase().includes(query)) &&
                            (!hl.note || !hl.note.toLowerCase().includes(query))
                        ) {
                            return;
                        }

                        allHighlights.push({
                            ...hl,
                            _chapterPath: chapter.path,
                            _chapterTitle: chapter.title,
                        });
                    });
                });

                allHighlights.sort((a, b) => {
                    const timeA = a.createdAt || 0;
                    const timeB = b.createdAt || 0;

                    return sortMode === "newest"
                        ? timeB - timeA
                        : timeA - timeB;
                });

                if (allHighlights.length > 0) {
                    processedData = [
                        {
                            path: "",
                            title: `Search Results (${allHighlights.length})`,
                            highlights: allHighlights,
                            isFlatList: true,
                        },
                    ];
                }
            }

            this.renderGlobalHighlights(
                content,
                processedData,
                manager.config.storagePrefix,
            );
        },

        closeOverviewModal() {
            document
                .getElementById("overviewOverlay")
                .classList.remove("active");
        },

        renderGlobalHighlights(container, data, storagePrefix) {
            if (!data?.length) {
                container.innerHTML = `<div class="overview-empty">No highlights found.</div>`;
                return;
            }

            const icons = {
                copy: `<svg class="icon-copy" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
                check: `<svg class="icon-check" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
                del: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
            };

            const formatTitle = (source) => {
                const titleText = source.title || source.chapterTitle || "";
                if (source.chapterNum) {
                    return titleText
                        ? `Ch. ${source.chapterNum}: ${titleText}`
                        : `Ch. ${source.chapterNum}`;
                }
                return titleText;
            };

            container.innerHTML = data
                .map((group) => {
                    const groupTitle = formatTitle(group);
                    const groupLinkHtml = !group.isFlatList
                        ? `<a href="${group.path}" class="hl-chapter-link">Go to Chapter</a>`
                        : "";

                    const itemsHtml = group.highlights
                        .map((hl) => {
                            const linkUrl = group.isFlatList
                                ? hl._chapterPath
                                : group.path;
                            const contextText = group.isFlatList
                                ? formatTitle(hl)
                                : null;

                            const contextHtml = contextText
                                ? `<div class="hl-context-label" style="font-size:0.75rem; opacity:0.6; margin-bottom:4px;">${contextText}</div>`
                                : "";

                            return `
                    <div class="hl-item">
                        ${contextHtml}
                        <div class="hl-top-row">
                            <a href="${linkUrl}#${hl.id}" class="hl-quote ${hl.color} hl-link">${hl.text}</a>
                            <div class="hl-actions">
                                <button class="icon-btn copy-btn" title="Copy highlight">${icons.copy}${icons.check}</button>
                                <button class="icon-btn delete-btn" data-key="${storagePrefix}${linkUrl}" data-id="${hl.id}" title="Delete highlight">${icons.del}</button>
                            </div>
                        </div>
                        ${hl.note ? `<div class="hl-user-note">${hl.note}</div>` : ""}
                    </div>`;
                        })
                        .join("");

                    return `
                <div class="hl-chapter-group">
                    <div class="hl-chapter-title">
                        <span>${groupTitle}</span>
                        ${groupLinkHtml}
                    </div>
                    ${itemsHtml}
                </div>`;
                })
                .join("");
        },
    },

    storage: {
        _write(key, callback) {
            try {
                const list = this.get(key);
                const newList = callback(list);
                if (newList) {
                    localStorage.setItem(key, JSON.stringify(newList));
                }
            } catch (e) {
                console.error("Storage write failed", e);
            }
        },

        get(key) {
            try {
                return JSON.parse(localStorage.getItem(key) || "[]");
            } catch {
                return [];
            }
        },

        getById(key, id) {
            return this.get(key).find((i) => i.id === id);
        },

        save(key, item) {
            this._write(key, (list) => {
                list.push(item);
                return list;
            });
        },

        delete(key, id) {
            this._write(key, (list) => list.filter((i) => i.id !== id));
        },

        update(key, id, changes) {
            this._write(key, (list) => {
                return list.map((item) => {
                    if (item.id === id) {
                        return { ...item, ...changes };
                    }
                    return item;
                });
            });
        },

        getAllGlobal(prefix) {
            const allData = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith(prefix)) {
                    try {
                        const highlights = JSON.parse(
                            localStorage.getItem(key),
                        );
                        if (
                            Array.isArray(highlights) &&
                            highlights.length > 0
                        ) {
                            const path = key.substring(prefix.length);
                            const first = highlights[0];
                            const title = first.pageTitle || "Unknown Chapter";
                            const chapterNum =
                                first.chapterNum ||
                                path
                                    .split("/")
                                    .pop()
                                    ?.replace(/-/g, " ")
                                    .replace(".html", "");

                            allData.push({
                                path,
                                title,
                                chapterNum,
                                highlights,
                            });
                        }
                    } catch (e) {
                        console.error("Parse error", key, e);
                    }
                }
            }
            return allData.sort((a, b) => a.path.localeCompare(b.path));
        },
    },
};

HighlightManager.init();
