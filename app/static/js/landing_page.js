document.getElementById('start_btn').addEventListener('click',(e)=>{
    e.preventDefault();
    window.location.href='/editor';
});
document.getElementById('get_start').addEventListener('click',(e)=>{
    e.preventDefault();
    window.location.href='/editor';
});
document.querySelector(".signin-btn").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "/sign_in";
});
document.querySelector(".signup-btn").addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "/sign_up";
});
document.querySelector('.outline-btn').addEventListener('click',(e)=>{
    e.preventDefault();
    window.location.href='/sign_in';
})

