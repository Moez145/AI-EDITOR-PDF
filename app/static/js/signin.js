document.getElementById('loginForm').addEventListener('submit',async function (e) {
    e.preventDefault();
    const email=document.getElementById('email').value;
    const password=document.getElementById('password').value;
    const response=await fetch('/auth/login',{
        method:'POST',
        headers:{
            "Content-Type":"application/json"},
            body:JSON.stringify({
                email:email,
                password:password
            })

    });
    const data=await response.json();
    if (response.ok){
        // Save JWT Token
        localStorage.setItem("access_token", data.access_token);

        document.getElementById("message").innerHTML =
        "✅ Login Successful";

        // Redirect
        window.location.href="/dashboard";
    }
    else{
        document.getElementById('message').innerHTML=data.detail;
    }
})