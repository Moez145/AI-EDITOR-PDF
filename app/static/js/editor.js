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
        PDF_ENDPOINT: "/editor/pdf"
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

            const loadingTask = pdfjsLib.getDocument({
                url: `${CONFIG.API.PDF_ENDPOINT}/${pdfId}`,
                httpHeaders: {
                    Authorization: `Bearer ${token}`
                }
            });

            const pdfDoc = await loadingTask.promise;
            AppState.setPDF(pdfDoc);

            // Update UI
            DOM.pageCount.textContent = `/ ${AppState.totalPages}`;
            DOM.pageCount.setAttribute("aria-label", `Total pages: ${AppState.totalPages}`);

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

        // Close on Escape key
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
                if (AppState.pdf) {
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

        const pdfId = window.location.pathname.split("/").pop();
        const token = localStorage.getItem("access_token");

        if (!pdfId || !token) {
            UIManager.showError("Missing PDF ID or authentication token");
            return;
        }

        await PDFRenderer.loadPDF(pdfId, token);

        DOM.pageInput.value = AppState.currentPage;
        DOM.pageInput.setAttribute("max", AppState.totalPages);
        DOM.pageInput.setAttribute("aria-label", `Page 1 of ${AppState.totalPages}`);

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