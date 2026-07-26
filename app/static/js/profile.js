const token = localStorage.getItem("access_token");

async function get_profile_data() {
    try{
        const response=await fetch('/profile/me',{
            method:'GET',
            headers:{
                Authorization:`Bearer ${token}`
            }
        });
        const user=await response.json();
        document.getElementById("first-name").value = user.username;
        document.getElementById("email_profile_Setting").value = user.email;
        document.getElementById("email_profile").textContent = user.email;
        document.getElementById('user').textContent=user.username;

    }
    catch(error){
        console.error(error)
    }   
}
get_profile_data()

document.getElementById("save_btn").addEventListener("click", async (e) => {
    e.preventDefault();

    const username = document.getElementById("first-name").value;
    const email = document.getElementById("email_profile_Setting").value;
    const password = document.getElementById("password_profile").value;

    try {
        const response = await fetch("/profile/me", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                username,
                email,
                password
            })
        });

        if (!response.ok) {
            throw new Error("Profile update failed");
        }

        const user = await response.json();

        alert("Profile updated successfully!");
        document.getElementById('password_profile').value="";

    } catch (error) {
        console.error(error);
    }
});