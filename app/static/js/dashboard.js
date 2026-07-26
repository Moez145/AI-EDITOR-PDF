const token = localStorage.getItem("access_token");

// Redirect if not logged in
if (!token) {
    window.location.href = "/sign_in";
}

// =========================
// Navigation
// =========================

document.getElementById("logout").addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("access_token");
    window.location.href = "/sign_in";
});

document.getElementById("history").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "/history";
});

document.getElementById("profile").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "/profile";
});

// =========================
// Load User Information
// =========================

async function load_User() {

    try {

        const response = await fetch("/auth/me", {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            localStorage.removeItem("access_token");
            window.location.href = "/sign_in";
            return;
        }

        const user = await response.json();

        document.getElementById("username").textContent = user.username;
        document.getElementById("email").textContent = user.email;

    } catch (error) {

        console.error(error);

    }

}

// =========================
// Load Recent Documents
// =========================

async function loadRecentDocuments() {

    try {

        const response = await fetch("/pdf/recent", {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error("Unable to load recent documents");
        }

        const documents = await response.json();
        const container = document.getElementById("recent_Documents");
        container.innerHTML = "";


        documents.forEach(doc => {

            container.innerHTML += `
            
            <div class="document-card">

                <div class="document-top">

                    <div class="document-info">

                        <div class="document-icon">
                            <i class="fa-regular fa-file-pdf"></i>
                        </div>

                        <div>

                            <h3>${doc.filename}</h3>

                            <p>${new Date(doc.upload_time).toLocaleString()}</p>

                        </div>

                    </div>

                    <i class="fa-solid fa-ellipsis-vertical"></i>

                </div>

                <div class="document-bottom">

                    <span>${doc.filesize} KB</span>

                    <span>•</span>

                    <span>${doc.file_pages} pages</span>

                    <span class="status">Ready</span>

                    <button
                    class="submit_button"
                    data-id="${doc.id}">
                        Submit
                    </button>

                </div>

            </div>

            `;

        });
        document.querySelectorAll(".submit_button").forEach(button => {

            button.addEventListener("click", () => {

                const pdfId = button.dataset.id;
                
                window.location.href = `/editor/${pdfId}`;


            });

        });


    } catch (error) {

        console.error(error);

    }
}
async function loadDashboardStats() {

    try {

        const response = await fetch("/pdf/dashboard-stats", {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error("Unable to load Dashboard Stats.");
        }

        const stats = await response.json();

        console.log("Dashboard Stats:", stats);

        document.getElementById("total_Documents").textContent =
            stats.total_doc;

        document.getElementById("storage_Used").textContent =
            `${stats.total_size} KB`;

    } catch (error) {

        console.error(error);

    }
}
// =========================
// Load Dashboard Data
// =========================

async function loadRecentActivity() {

    try {

        const response = await fetch("/pdf/today", {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error("Unable to load activity");
        }

        const activities = await response.json();

        const container = document.getElementById("recentActivity");
        container.innerHTML = "";

        activities.forEach(activity => {

            container.innerHTML += `
                <div class="activity-item">

                    <div class="activity-icon">
                        <i class="fa-solid fa-arrow-up-from-bracket"></i>
                    </div>

                    <div>

                        <h4>Uploaded ${activity.filename}</h4>

                        <p>${new Date(activity.upload_time).toLocaleString()}</p>

                    </div>

                </div>
            `;

        });

    } catch (error) {
        console.error(error);
    }

}

window.addEventListener("DOMContentLoaded", () => {

    load_User();
    loadRecentDocuments();
    loadDashboardStats();
    loadRecentActivity();
});