/**
 * PDF Editor Application
 * Handles PDF rendering, zoom, navigation, thumbnails, and AI assistant panel
 */

// ===============================================
// CONFIGURATION & CONSTANTS
// ===============================================
const CONFIG = {
    PDF_WORKER_URL: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
    ZOOM: {
        MIN: 50,
        MAX: 200,
        STEP: 10,
        DEFAULT: 100
    },
    CANVAS: {
        PADDING: 40,
        DEBOUNCE_DELAY: 300
    },
    THUMBNAIL: {
        SCALE: 0.25
    },
    AI_PANEL: {
        ANIMATION_DURATION: 350
    },
    API: {
        PDF_ENDPOINT: "/editor/pdf",
        EDITOR_ENDPOINT: "/editor"
    }
};

// ===============================================
// STATE MANAGEMENT
// ===============================================
const AppState = {
    pdf: null,
    currentPage: 1,
    totalPages: 0,
    zoom: CONFIG.ZOOM.DEFAULT,
    isLoading: false,
    isResizing: false,
    fileSizeBytes: 0,
    pdfId: null,
    token: null,
    isEditingText: false,

    setPDF(doc) {
        this.pdf = doc;
        this.totalPages = doc.numPages;
    },

    setPage(page) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            return true;
        }
        return false;
    },

    setZoom(level) {
        const z = Math.max(CONFIG.ZOOM.MIN, Math.min(CONFIG.ZOOM.MAX, level));
        this.zoom = z;
        return z;
    },

    getZoom() {
        return this.zoom;
    }
};

// ===============================================
// DOM SELECTORS & CACHING
// ===============================================
const DOM = {
    // PDF Canvas
    canvas: document.getElementById("pdfCanvas"),
    ctx: null,
    pdfCanvas: document.querySelector(".pdf-canvas"),      // scroll container (for sizing)
    pdfPlaceholder: document.getElementById("pdfPlaceholder"),

    // Navbar
    zoomValue: document.querySelector(".zoom-value"),
    zoomOutBtn: document.getElementById("zoomOut"),
    zoomInBtn: document.getElementById("zoomIn"),
    pageInput: document.querySelector(".page-input"),
    prevPageBtn: document.getElementById("prevPage"),
    nextPageBtn: document.getElementById("nextPage"),
    pageCount: document.querySelector(".page-count"),

    // AI Panel
    aiPanel: document.getElementById("aiPanel"),
    aiToggleBtn: document.getElementById("aiToggleBtn"),
    aiCloseBtn: document.getElementById("aiCloseBtn"),
    aiBackdrop: document.getElementById("aiBackdrop"),
    tabs: document.querySelectorAll(".tab"),

    // Chat
    chatContainer: document.getElementById("chatContainer"),
    chatInput: document.getElementById("chatInput"),
    sendBtn: document.getElementById("sendBtn"),

    // Thumbnails (the scrollable list container in the sidebar)
    thumbnailList: document.querySelector(".thumbnail-list"),

    // Document info (size / page count in sidebar header)
    fileInfo: document.getElementById("file-info"),
    filePages: document.getElementById("file-pages"),

    // Editor button (extracts text from the PDF)
    pdfEditorBtn: document.getElementById("pdf_editor"),

    // Text-edit overlay (created dynamically by TextEditManager, cached once built)
    textEditLayer: null,

    // Initialize context
    init() {
        if (this.canvas) {
            this.ctx = this.canvas.getContext("2d");
        }
    }
};

// Initialize DOM cache
DOM.init();

// ===============================================
// PDF RENDERING
// ===============================================
class PDFRenderer {
    static async initialize() {
        try {
            pdfjsLib.GlobalWorkerOptions.workerSrc = CONFIG.PDF_WORKER_URL;
        } catch (error) {
            console.error("Failed to initialize PDF.js:", error);
            UIManager.showError("Failed to initialize PDF viewer");
        }
    }

    static async renderPage(pageNumber) {
        if (!AppState.pdf) {
            console.warn("PDF not loaded");
            return;
        }

        try {
            UIManager.setLoading(true);

            const page = await AppState.pdf.getPage(pageNumber);
            const originalViewport = page.getViewport({ scale: 1 });

            // Calculate responsive scale
            const scale = this.calculateScale(originalViewport);
            const viewport = page.getViewport({ scale });

            // Render to canvas with high-DPI support
            await this.renderToCanvas(page, viewport);

            AppState.currentPage = pageNumber;
            UIManager.setLoading(false);
        } catch (error) {
            console.error("Error rendering page:", error);
            UIManager.showError("Failed to render page");
            UIManager.setLoading(false);
        }
    }

    static calculateScale(originalViewport) {
        const availableWidth = DOM.pdfCanvas.clientWidth - CONFIG.CANVAS.PADDING;
        const availableHeight = DOM.pdfCanvas.clientHeight - CONFIG.CANVAS.PADDING;

        const baseScale = Math.min(
            availableWidth / originalViewport.width,
            availableHeight / originalViewport.height
        );

        // Apply zoom percentage
        const zoomMultiplier = AppState.getZoom() / 100;
        return baseScale * zoomMultiplier;
    }

    static async renderToCanvas(page, viewport) {
        const outputScale = window.devicePixelRatio || 1;

        DOM.canvas.width = viewport.width * outputScale;
        DOM.canvas.height = viewport.height * outputScale;
        DOM.canvas.style.width = viewport.width + "px";
        DOM.canvas.style.height = viewport.height + "px";

        DOM.ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);

        await page.render({
            canvasContext: DOM.ctx,
            viewport: viewport
        }).promise;
    }

    static async loadPDF(pdfId, token) {
        try {
            UIManager.setLoading(true);

            // Fetch the PDF ourselves (instead of letting pdf.js fetch it) so we
            // can read the custom X-Page-Count / X-Page-Size headers the backend sends.
            const response = await fetch(`${CONFIG.API.PDF_ENDPOINT}/${pdfId}`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch PDF: ${response.status}`);
            }

            const headerPageCount = parseInt(response.headers.get("X-Page-Count"), 10);
            const headerPageSize = parseInt(response.headers.get("X-Page-Size"), 10);

            const arrayBuffer = await response.arrayBuffer();

            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdfDoc = await loadingTask.promise;
            AppState.setPDF(pdfDoc);

            // Prefer backend-provided values; fall back to what pdf.js/the buffer tell us
            AppState.totalPages = Number.isFinite(headerPageCount) ? headerPageCount : pdfDoc.numPages;
            AppState.fileSizeBytes = Number.isFinite(headerPageSize) ? headerPageSize : arrayBuffer.byteLength;

            // Update UI
            DOM.pageCount.textContent = `/ ${AppState.totalPages}`;
            DOM.pageCount.setAttribute("aria-label", `Total pages: ${AppState.totalPages}`);
            UIManager.updateFileInfo();

            // Build sidebar thumbnails, then render first page
            await ThumbnailManager.build(pdfDoc);
            await this.renderPage(AppState.currentPage);

            // Hide placeholder, show canvas
            DOM.pdfPlaceholder.style.display = "none";
            DOM.canvas.style.display = "block";

            UIManager.setLoading(false);
        } catch (error) {
            console.error("Failed to load PDF:", error);
            UIManager.showError("Unable to load PDF. Please try again.");
            UIManager.setLoading(false);
        }
    }
}

// ===============================================
// ZOOM MANAGEMENT
// ===============================================
class ZoomManager {
    static updateZoom(newZoom) {
        const z = AppState.setZoom(newZoom);
        DOM.zoomValue.textContent = z + "%";
        DOM.zoomValue.setAttribute("aria-label", `Zoom level: ${z}%`);

        if (AppState.pdf) {
            PDFRenderer.renderPage(AppState.currentPage);
        }
    }

    static zoomIn() {
        const newZoom = AppState.getZoom() + CONFIG.ZOOM.STEP;
        this.updateZoom(newZoom);
    }

    static zoomOut() {
        const newZoom = AppState.getZoom() - CONFIG.ZOOM.STEP;
        this.updateZoom(newZoom);
    }

    static setupListeners() {
        DOM.zoomInBtn.addEventListener("click", () => this.zoomIn());
        DOM.zoomOutBtn.addEventListener("click", () => this.zoomOut());
    }
}

// ===============================================
// PAGE NAVIGATION
// ===============================================
class PageNavigator {
    static setPage(pageNumber) {
        const validPage = Math.max(1, Math.min(AppState.totalPages, parseInt(pageNumber) || 1));

        if (!AppState.setPage(validPage)) {
            return;
        }

        DOM.pageInput.value = validPage;
        DOM.pageInput.setAttribute("aria-label", `Page ${validPage} of ${AppState.totalPages}`);

        if (AppState.pdf) {
            PDFRenderer.renderPage(validPage);
        }

        ThumbnailManager.setActive(validPage - 1);
    }

    static nextPage() {
        this.setPage(AppState.currentPage + 1);
    }

    static prevPage() {
        this.setPage(AppState.currentPage - 1);
    }

    static setupListeners() {
        DOM.pageInput.addEventListener("change", (e) => {
            this.setPage(e.target.value);
        });

        // Allow Enter key to confirm page input
        DOM.pageInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                this.setPage(DOM.pageInput.value);
            }
        });

        DOM.nextPageBtn.addEventListener("click", () => this.nextPage());
        DOM.prevPageBtn.addEventListener("click", () => this.prevPage());

        // Keyboard shortcuts
        document.addEventListener("keydown", (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === "+") {
                    e.preventDefault();
                    ZoomManager.zoomIn();
                } else if (e.key === "-") {
                    e.preventDefault();
                    ZoomManager.zoomOut();
                }
            }
            if (e.key === "ArrowLeft") this.prevPage();
            if (e.key === "ArrowRight") this.nextPage();
        });
    }
}

// ===============================================
// THUMBNAIL MANAGEMENT
// ===============================================
class ThumbnailManager {
    /**
     * Builds all sidebar thumbnails for the given pdf.js document
     * and wires up click/keyboard handlers.
     */
    static async build(pdfDoc) {
        const list = DOM.thumbnailList;
        list.innerHTML = "";

        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: CONFIG.THUMBNAIL.SCALE });

            const thumbCanvas = document.createElement("canvas");
            thumbCanvas.width = viewport.width;
            thumbCanvas.height = viewport.height;

            await page.render({
                canvasContext: thumbCanvas.getContext("2d"),
                viewport: viewport
            }).promise;

            thumbCanvas.classList.add("thumbnail");

            const wrapper = document.createElement("div");
            wrapper.className = "thumbnail-item";
            wrapper.setAttribute("role", "button");
            wrapper.setAttribute("tabindex", "0");
            wrapper.setAttribute("aria-label", `Page ${i}`);

            wrapper.appendChild(thumbCanvas);

            const label = document.createElement("div");
            label.className = "page-label";
            label.innerText = `Page ${i}`;
            wrapper.appendChild(label);

            list.appendChild(wrapper);
        }

        this.setupListeners();
        this.setActive(AppState.currentPage - 1);
    }

    static setActive(index) {
        const items = document.querySelectorAll(".thumbnail-item");
        items.forEach((item, i) => {
            const thumbnail = item.querySelector(".thumbnail");
            if (!thumbnail) return;
            if (i === index) {
                thumbnail.classList.add("active-thumb");
                item.setAttribute("aria-current", "true");
            } else {
                thumbnail.classList.remove("active-thumb");
                item.setAttribute("aria-current", "false");
            }
        });
    }

    static setupListeners() {
        const items = document.querySelectorAll(".thumbnail-item");
        items.forEach((item, index) => {
            item.addEventListener("click", () => PageNavigator.setPage(index + 1));

            item.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    PageNavigator.setPage(index + 1);
                }
            });
        });
    }
}

// ===============================================
// CHAT MANAGEMENT
// ===============================================
class ChatManager {
    static addUserMessage(text) {
        const userMsg = document.createElement("div");
        userMsg.className = "chat-message user-message";
        userMsg.setAttribute("role", "article");
        userMsg.innerHTML = `
            <div class="message user-msg-body"><p>${this.escapeHTML(text)}</p></div>
            <div class="avatar user-avatar-icon" aria-label="You"><i class="fa-solid fa-user"></i></div>
        `;
        DOM.chatContainer.appendChild(userMsg);
        this.scrollToBottom();
    }

    static addAIMessage(text) {
        const aiMsg = document.createElement("div");
        aiMsg.className = "chat-message ai-message";
        aiMsg.setAttribute("role", "article");
        aiMsg.innerHTML = `
            <div class="avatar ai-avatar" aria-label="AI Assistant"><i class="fa-solid fa-robot"></i></div>
            <div class="message">
                <h4>DocuAI Assistant</h4>
                <p>${this.escapeHTML(text)}</p>
            </div>
        `;
        DOM.chatContainer.appendChild(aiMsg);
        this.scrollToBottom();
    }

    static scrollToBottom() {
        DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight;
    }

    static escapeHTML(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    static async sendMessage() {
        const text = DOM.chatInput.value.trim();
        if (!text) return;

        this.addUserMessage(text);
        DOM.chatInput.value = "";

        UIManager.setChatLoading(true);
        await new Promise((resolve) => setTimeout(resolve, 600));

        this.addAIMessage(
            `I received your question: "${text}". Please upload a PDF so I can give you a detailed answer.`
        );
        UIManager.setChatLoading(false);
    }

    static setupListeners() {
        DOM.sendBtn.addEventListener("click", () => this.sendMessage());
        DOM.chatInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }
}

// ===============================================
// UI MANAGER
// ===============================================
class UIManager {
    static setLoading(isLoading) {
        AppState.isLoading = isLoading;
        DOM.zoomInBtn.disabled = isLoading;
        DOM.zoomOutBtn.disabled = isLoading;
        DOM.pageInput.disabled = isLoading;
        DOM.prevPageBtn.disabled = isLoading;
        DOM.nextPageBtn.disabled = isLoading;
    }

    static setChatLoading(isLoading) {
        DOM.sendBtn.disabled = isLoading;
        DOM.sendBtn.setAttribute("aria-busy", isLoading);
        DOM.chatInput.disabled = isLoading;
    }

    static showError(message) {
        console.error(message);
        alert(message); // Replace with toast notification in production
    }

    static formatFileSize(bytes) {
        if (!bytes || bytes < 0) return "0 KB";
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    static updateFileInfo() {
        if (DOM.fileInfo) {
            DOM.fileInfo.textContent = this.formatFileSize(AppState.fileSizeBytes);
        }
        if (DOM.filePages) {
            const pages = AppState.totalPages || 0;
            DOM.filePages.textContent = `${pages} page${pages === 1 ? "" : "s"}`;
        }
    }
}

// ===============================================
// TEXT EDIT OVERLAY (span-based, positioned to match
// the original PDF layout: each text run from
// get_pdf_data() is rendered as an absolutely
// positioned, individually editable element on top
// of a page-sized box. Images render underneath,
// non-editable. bbox/font/size/color/flags are kept
// intact per span and only .text is ever mutated, so
// the payload sent back to PUT /text matches exactly
// what update_pdf_text() on the backend expects.)
// ===============================================
class TextEditManager {
    /**
     * Lazily builds the overlay layer and inserts it into the same
     * scroll container that holds the PDF canvas, so it occupies the
     * same visual space.
     */
    static ensureLayer() {
        if (DOM.textEditLayer) return DOM.textEditLayer;

        const layer = document.createElement("div");
        layer.id = "textEditLayer";
        layer.style.display = "none";
        layer.style.flexDirection = "column";
        layer.style.alignItems = "center";
        layer.style.gap = "24px";
        layer.style.width = "100%";
        layer.style.height = "100%";
        layer.style.overflowY = "auto";
        layer.style.boxSizing = "border-box";
        layer.style.padding = "20px";

        // Small toolbar: back to PDF view / save state
        const toolbar = document.createElement("div");
        toolbar.style.position = "sticky";
        toolbar.style.top = "0";
        toolbar.style.zIndex = "5";
        toolbar.style.display = "flex";
        toolbar.style.gap = "10px";
        toolbar.style.alignSelf = "flex-start";
        toolbar.style.background = "#fff";
        toolbar.style.padding = "6px 0";

        const backBtn = document.createElement("button");
        backBtn.type = "button";
        backBtn.textContent = "← Back to PDF view";
        backBtn.style.cursor = "pointer";
        backBtn.style.padding = "6px 12px";
        backBtn.style.border = "1px solid #d0d5dd";
        backBtn.style.borderRadius = "6px";
        backBtn.style.background = "#f9fafb";
        backBtn.addEventListener("click", () => TextEditManager.hide());

        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.textContent = "Save changes";
        saveBtn.style.cursor = "pointer";
        saveBtn.style.padding = "6px 12px";
        saveBtn.style.border = "1px solid #2563eb";
        saveBtn.style.borderRadius = "6px";
        saveBtn.style.background = "#2563eb";
        saveBtn.style.color = "#fff";
        saveBtn.addEventListener("click", () => TextEditManager.saveEdits());

        toolbar.appendChild(backBtn);
        toolbar.appendChild(saveBtn);
        layer.appendChild(toolbar);

        const pagesWrapper = document.createElement("div");
        pagesWrapper.id = "textEditPages";
        pagesWrapper.style.display = "flex";
        pagesWrapper.style.flexDirection = "column";
        pagesWrapper.style.gap = "24px";
        pagesWrapper.style.width = "100%";
        pagesWrapper.style.alignItems = "center";
        layer.appendChild(pagesWrapper);

        // Insert into the same container the canvas lives in so it
        // takes over the same viewing area.
        DOM.pdfCanvas.appendChild(layer);
        DOM.textEditLayer = layer;
        return layer;
    }

    /**
     * Renders one absolutely-positioned page box per page, with each
     * text span placed at its scaled bbox and made contenteditable,
     * and each image placed underneath (non-editable).
     *
     * @param {{page:number, width:number, height:number,
     *           spans:{text:string,bbox:number[],font:string,size:number,color:number,flags:number}[],
     *           images:{bbox:number[],ext:string,data:string}[]}[]} pages
     */
    static show(pages) {
        const layer = this.ensureLayer();
        const pagesWrapper = layer.querySelector("#textEditPages");
        pagesWrapper.innerHTML = "";

        const list = Array.isArray(pages) ? pages : [];
        // Keep the original structure around so collectEdits() can merge
        // edited text back in without losing bbox/font/size/color/flags.
        this._pagesData = list;

        if (!list.length) {
            const empty = document.createElement("p");
            empty.textContent = "No text could be extracted from this PDF.";
            pagesWrapper.appendChild(empty);
        } else {
            // Fit page width to the available container (capped so huge
            // pages don't blow out the layout on wide screens).
            const containerWidth = Math.min(DOM.pdfCanvas.clientWidth - 80, 800);

            list.forEach((p) => {
                const scale = containerWidth / p.width;
                const pageHeight = p.height * scale;

                const pageBox = document.createElement("div");
                pageBox.className = "text-edit-page";
                pageBox.dataset.page = p.page;
                pageBox.dataset.scale = scale;
                pageBox.style.position = "relative";
                pageBox.style.width = `${containerWidth}px`;
                pageBox.style.height = `${pageHeight}px`;
                pageBox.style.background = "#fff";
                pageBox.style.border = "1px solid #e4e7ec";
                pageBox.style.borderRadius = "4px";
                pageBox.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)";
                pageBox.style.overflow = "hidden";
                pageBox.style.flexShrink = "0";

                // Images render first (underneath), non-editable, and are
                // never sent back to the server — only spans are edited.
                (p.images || []).forEach((img) => {
                    const [x0, y0, x1, y1] = img.bbox;
                    const imgEl = document.createElement("img");
                    imgEl.src = `data:image/${img.ext};base64,${img.data}`;
                    imgEl.style.position = "absolute";
                    imgEl.style.left = `${x0 * scale}px`;
                    imgEl.style.top = `${y0 * scale}px`;
                    imgEl.style.width = `${(x1 - x0) * scale}px`;
                    imgEl.style.height = `${(y1 - y0) * scale}px`;
                    imgEl.style.pointerEvents = "none";
                    pageBox.appendChild(imgEl);
                });

                // Each text span is its own editable element, positioned
                // to match where PyMuPDF found it in the original PDF.
                (p.spans || []).forEach((span, idx) => {
                    const [x0, y0, x1, y1] = span.bbox;
                    const el = document.createElement("div");
                    el.className = "text-edit-span";
                    el.contentEditable = "true";
                    el.spellcheck = true;
                    el.dataset.spanIndex = idx;
                    el.textContent = span.text;

                    el.style.position = "absolute";
                    el.style.left = `${x0 * scale}px`;
                    el.style.top = `${y0 * scale}px`;
                    el.style.minWidth = `${(x1 - x0) * scale}px`;
                    el.style.minHeight = `${(y1 - y0) * scale}px`;
                    el.style.fontSize = `${span.size * scale}px`;
                    el.style.lineHeight = "1";
                    el.style.color = this._intToCss(span.color);
                    el.style.fontWeight = (span.flags & 16) ? "bold" : "normal";
                    el.style.fontStyle = (span.flags & 2) ? "italic" : "normal";
                    // Wrap in the browser too (not just on save) so what the
                    // user sees while editing is close to what gets redrawn
                    // server-side, instead of a single unbroken line.
                    el.style.whiteSpace = "pre-wrap";
                    el.style.wordBreak = "break-word";
                    el.style.outline = "none";
                    el.style.cursor = "text";
                    el.style.padding = "0";
                    el.style.border = "1px solid transparent";

                    el.addEventListener("focus", () => {
                        el.style.border = "1px dashed #2563eb";
                        el.style.background = "rgba(37,99,235,0.05)";
                    });
                    el.addEventListener("blur", () => {
                        el.style.border = "1px solid transparent";
                        el.style.background = "transparent";
                    });

                    pageBox.appendChild(el);
                });

                pagesWrapper.appendChild(pageBox);
            });
        }

        // Swap the canvas view out for the editable text view
        DOM.canvas.style.display = "none";
        if (DOM.pdfPlaceholder) DOM.pdfPlaceholder.style.display = "none";
        layer.style.display = "flex";
        AppState.isEditingText = true;
    }

    static _intToCss(colorInt) {
        const r = (colorInt >> 16) & 255;
        const g = (colorInt >> 8) & 255;
        const b = colorInt & 255;
        return `rgb(${r}, ${g}, ${b})`;
    }

    /** Switch back to the normal PDF canvas view */
    static hide() {
        if (DOM.textEditLayer) {
            DOM.textEditLayer.style.display = "none";
        }
        AppState.isEditingText = false;
        if (AppState.pdf) {
            DOM.canvas.style.display = "block";
            PDFRenderer.renderPage(AppState.currentPage);
        } else if (DOM.pdfPlaceholder) {
            DOM.pdfPlaceholder.style.display = "flex";
        }
    }

    /**
     * Merges edited text back into the original per-page span structure.
     * bbox/font/size/color/flags are carried over untouched from the data
     * `show()` was given — only `.text` is replaced with whatever the user
     * typed. This keeps the payload shape identical to what update_pdf_text()
     * expects on the backend (wrapping to the original bbox width happens
     * server-side).
     */
    static collectEdits() {
        if (!DOM.textEditLayer || !this._pagesData) return [];

        const pageBoxes = DOM.textEditLayer.querySelectorAll(".text-edit-page");

        return Array.from(pageBoxes).map((pageBox) => {
            const pageNum = parseInt(pageBox.dataset.page, 10);
            const original = this._pagesData.find((p) => p.page === pageNum);
            const spanEls = pageBox.querySelectorAll(".text-edit-span");

            const spans = Array.from(spanEls).map((el) => {
                const idx = parseInt(el.dataset.spanIndex, 10);
                const originalSpan = original.spans[idx];
                return {
                    ...originalSpan,
                    text: el.innerText
                };
            });

            return { page: pageNum, spans };
        });
    }

    /**
     * Sends the edited spans back to the backend, which redacts each
     * original span region and redraws the (possibly changed) text,
     * word-wrapped to fit the original bbox width.
     */
    static async saveEdits() {
        const edited = this.collectEdits();
        const { pdfId, token } = AppState;

        if (!pdfId || !token) {
            UIManager.showError("Missing PDF ID or authentication token");
            return;
        }

        try {
            const response = await fetch(`${CONFIG.API.PDF_ENDPOINT}/${pdfId}/text`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ pages: edited })
            });

            if (!response.ok) {
                throw new Error(`Failed to save: ${response.status}`);
            }

            ChatManager.addAIMessage("Your edits were saved.");
        } catch (error) {
            console.error("Saving edited text failed:", error);
            UIManager.showError("Failed to save your edits");
        }
    }
}

// ===============================================
// EDITOR / TEXT EXTRACTION + SIDEBAR CONTROL
// ===============================================
class EditorManager {
  /**
   * Shows the sidebar (AI panel + editor toolbar), extracts text from
   * the current PDF, and renders it as editable content in the canvas area.
   */
  static async extractText() {
    const { pdfId, token } = AppState;

    if (!pdfId || !token) {
      UIManager.showError("Missing PDF ID or authentication token");
      return null;
    }

    try {
      // 1. Show the sidebar / toolbar
      this.showSidebar();

      UIManager.setChatLoading(true);

      const response = await fetch(`${CONFIG.API.PDF_ENDPOINT}/${pdfId}/text`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load PDF text: ${response.status}`);
      }

      // Backend returns: [{ page, width, height, spans:[...], images:[...] }, ...]
      const pages = await response.json();

      // Render the extracted text directly on the canvas area, editable
      TextEditManager.show(pages);

      // Short confirmation in chat instead of dumping the full text there
      const spanCount = Array.isArray(pages)
        ? pages.reduce((sum, p) => sum + (p.spans ? p.spans.length : 0), 0)
        : 0;

      ChatManager.addAIMessage(
        Array.isArray(pages) && pages.length
          ? `Extracted text from ${pages.length} page${pages.length === 1 ? "" : "s"} (${spanCount} text blocks). You can edit it directly in the viewer.`
          : "No text could be extracted from this PDF."
      );

      return pages;
    } catch (error) {
      console.error("Text extraction failed:", error);
      UIManager.showError("Failed to extract text from PDF");
      return null;
    } finally {
      UIManager.setChatLoading(false);
    }
  }

  /** Show AI panel + editor toolbar */
  static showSidebar() {
    const toolbar = document.getElementById("editor-toolbar");
    if (toolbar) {
      toolbar.style.display = "flex";
      toolbar.classList.add("show");
    }
    AIPanelManager.open(); // opens the AI panel
  }

  /** Hide AI panel + editor toolbar */
  static hideSidebar() {
    const toolbar = document.getElementById("editor-toolbar");
    if (toolbar) {
      toolbar.classList.remove("show");
      // Optional: hide completely after animation
      // toolbar.style.display = "none";
    }
    AIPanelManager.close();
  }

  static setupListeners() {
    if (!DOM.pdfEditorBtn) return;

    DOM.pdfEditorBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      DOM.pdfEditorBtn.disabled = true;
      await this.extractText();
      DOM.pdfEditorBtn.disabled = false;
    });
  }
}

// ===============================================
// AI PANEL MANAGEMENT
// ===============================================
class AIPanelManager {
  static open() {
    DOM.aiPanel.classList.add("open");
    DOM.aiBackdrop.classList.add("show");
    DOM.aiToggleBtn.classList.add("active");
    DOM.aiToggleBtn.setAttribute("aria-expanded", "true");
  }

  static close() {
    DOM.aiPanel.classList.remove("open");
    DOM.aiBackdrop.classList.remove("show");
    DOM.aiToggleBtn.classList.remove("active");
    DOM.aiToggleBtn.setAttribute("aria-expanded", "false");

    // Also hide the editor toolbar when the panel is closed
    const toolbar = document.getElementById("editor-toolbar");
    if (toolbar) {
      toolbar.classList.remove("show");
    }
  }

  static toggle() {
    if (DOM.aiPanel.classList.contains("open")) {
      this.close();
    } else {
      this.open();
    }
  }

  static setupListeners() {
    DOM.aiToggleBtn.addEventListener("click", () => this.toggle());
    DOM.aiCloseBtn.addEventListener("click", () => this.close());
    DOM.aiBackdrop.addEventListener("click", () => this.close());

    // Close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && DOM.aiPanel.classList.contains("open")) {
        this.close();
      }
    });

    this.setupTabs();
  }

  static setupTabs() {
    DOM.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        DOM.tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
      });

      tab.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const tabs = Array.from(DOM.tabs);
          const currentIndex = tabs.indexOf(tab);
          const nextIndex =
            e.key === "ArrowRight"
              ? (currentIndex + 1) % tabs.length
              : (currentIndex - 1 + tabs.length) % tabs.length;
          tabs[nextIndex].click();
          tabs[nextIndex].focus();
        }
      });
    });
  }
}

// ===============================================
// RESPONSIVE RESIZE HANDLER (Debounced)
// ===============================================
class ResizeHandler {
    static init() {
        let resizeTimeout;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimeout);
            AppState.isResizing = true;

            resizeTimeout = setTimeout(() => {
                if (AppState.pdf && !AppState.isEditingText) {
                    PDFRenderer.renderPage(AppState.currentPage);
                }
                AppState.isResizing = false;
            }, CONFIG.CANVAS.DEBOUNCE_DELAY);
        });
    }
}

// ===============================================
// APPLICATION INITIALIZATION
// ===============================================
async function initializeApp() {
  try {
    await PDFRenderer.initialize();
    ZoomManager.setupListeners();
    PageNavigator.setupListeners();
    AIPanelManager.setupListeners();
    ChatManager.setupListeners();
    ResizeHandler.init();
    EditorManager.setupListeners();

    // Hide toolbar by default
    const toolbar = document.getElementById("editor-toolbar");
    if (toolbar) {
      toolbar.style.display = "none";
      toolbar.classList.remove("show");
    }

    const pdfId = window.location.pathname.split("/").pop();
    const token = localStorage.getItem("access_token");

    if (!pdfId || !token) {
      UIManager.showError("Missing PDF ID or authentication token");
      return;
    }

    AppState.pdfId = pdfId;
    AppState.token = token;

    await PDFRenderer.loadPDF(pdfId, token);

    DOM.pageInput.value = AppState.currentPage;
    DOM.pageInput.setAttribute("max", AppState.totalPages);
    DOM.pageInput.setAttribute(
      "aria-label",
      `Page 1 of ${AppState.totalPages}`
    );
  } catch (error) {
    console.error("Application initialization failed:", error);
    UIManager.showError("Failed to initialize the application");
  }
}

// ===============================================
// START APPLICATION
// ===============================================
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}