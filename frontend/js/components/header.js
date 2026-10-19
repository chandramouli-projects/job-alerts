/* Top bar: name, avatar, log out */
function renderHead() {
  $("headR").innerHTML = U
    ? `<span class="who">${esc(U.profile.name)}</span><span class="avatar">${initials(U.profile.name)}</span><button type="button" class="icon-btn" id="headOut" data-tip="Log out" aria-label="Log out">${LOGOUT}</button>`
    : "";
}
$("apphead").onclick = e => {
  if (e.target.closest("#headOut")) logout();
};
