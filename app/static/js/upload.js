const fileInput = document.getElementById("pdfFile");
const uploadBtn = document.getElementById("Upload_Button");

uploadBtn.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", uploadPDF);

async function uploadPDF() {

    const file = fileInput.files[0];

    if (!file) {
        return;
    }

    const token = localStorage.getItem("access_token");

    const formData = new FormData();
    formData.append("file", file);

    try {

        const response = await fetch("/pdf/upload", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error("Upload failed");
        }

        const data = await response.json();
        alert('PDF uploaded Successfully.');
        await loadRecentDocuments();
        await loadDashboardStats();

    } catch (error) {
        console.error(error);
        alert("Upload failed");
    }
}