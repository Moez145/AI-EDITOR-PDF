console.log("history_upload.js loaded");
const token = localStorage.getItem("access_token");
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

        const docs = await response.json();

        const filename_Data = document.getElementById("docs_viewer");

        filename_Data.innerHTML = "";

        docs.forEach(element => {

            filename_Data.innerHTML += `

            <div class="activity-item">

                <div class="activity-left">

                    <div class="activity-icon">

                        <i class="fa-solid fa-arrow-up-from-bracket"></i>

                    </div>

                    <div class="activity-info">

                        <h3>Upload</h3>

                        <p>

                            <i class="fa-regular fa-file-lines"></i>

                            Document:

                            <strong>${element.filename}</strong>

                        </p>

                    </div>

                </div>

                <div>

                    ${new Date(element.upload_time).toLocaleString()}

                </div>

            </div>

            `;

        });

    } catch (error) {

        console.error(error);

    }

}

loadRecentDocuments();