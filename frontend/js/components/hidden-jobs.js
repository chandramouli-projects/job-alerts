/* Hidden jobs: hiding one (card Hide, details "Not interested", or several picked) shows "Undo" for a few
   seconds; the Jobs page shows "N hidden", which opens the list of hidden jobs to unhide them. */
const UNDO_MS = 6000;

// a toast with one button (Undo); the plain toast() stays for messages
function toastUndo(text, onUndo) {
  const el = $("toast");
  el.innerHTML = `<span>${esc(text)}</span><button type="button" class="toast-act">Undo</button>`;
  el.classList.add("show", "has-act");
  clearTimeout(tt);
  tt = setTimeout(() => el.classList.remove("show", "has-act"), UNDO_MS);
  el.querySelector(".toast-act").onclick = () => {
    clearTimeout(tt);
    el.classList.remove("show", "has-act");
    onUndo();
  };
}

function hideJobs(ids) {
  const fresh = [...new Set(ids)].filter(id => !U.hidden[id]);
  if (!fresh.length) return;
  fresh.forEach(id => {
    U.hidden[id] = 1;
    picked?.delete(id);
  });
  saveUser();
  render();
  renderPickBar?.();
  toastUndo(fresh.length === 1 ? "Job hidden" : `${fresh.length} jobs hidden`, () => {
    fresh.forEach(id => delete U.hidden[id]);
    saveUser();
    render();
    toast("Back in your feed", "ok");
  });
}
function unhideJobs(ids) {
  ids.forEach(id => delete U.hidden[id]);
  saveUser();
  render();
}

// hidden jobs that are still listed (others have left the job list)
const hiddenListed = () =>
  Object.keys(U.hidden || {})
    .map(id => findJob(id) || U.jobs[id]?.snap)
    .filter(j => j && j.title);

function openHiddenJobs() {
  const list = hiddenListed(),
    gone = Object.keys(U.hidden || {}).length - list.length;
  openSheet(
    "Hidden jobs",
    list.length
      ? `<p class="hj-sub">These jobs don't show in your feed. Unhide one to see it again.</p>
    <div class="hj-list">${list
      .map(
        j => `<div class="hj-row">${logo(j)}<div class="hj-txt"><b>${esc(j.title)}</b><span>${esc(j.company)}${j.location ? ` · ${esc(cardPlace(j))}` : ""}</span></div>
      <button type="button" class="btn ghost sm" data-unhide="${esc(j.id)}">Unhide</button></div>`
      )
      .join("")}</div>
    ${gone > 0 ? `<p class="hj-sub">${gone} more hidden job${gone === 1 ? " is" : "s are"} no longer listed.</p>` : ""}`
      : `<div class="empty"><h3>No hidden jobs</h3>Jobs you hide with Hide or "Not interested" show here.</div>`,
    list.length > 1
      ? `<button class="btn ghost" data-unhideall>Unhide all</button><button class="btn" data-hjclose>Done</button>`
      : ""
  );
}

/* "N hidden" next to the job count on the Jobs page */
const _renderJobsH = renderJobs;
renderJobs = function () {
  _renderJobsH();
  const n = hiddenListed().length,
    bar = document.querySelector("#main .resbar>span");
  if (n && bar)
    bar.insertAdjacentHTML(
      "beforeend",
      ` · <button type="button" class="linkbtn hj-link" data-showhidden>${n} hidden</button>`
    );
};

// "Not interested" in the job details (data-hide) also gets Undo
document.addEventListener(
  "click",
  e => {
    const b = e.target.closest("[data-hide]");
    if (!b || !U) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    closeSheet();
    hideJobs([b.dataset.hide]);
  },
  true
);

/* buttons on this screen */
onAppClick((d, t, e) => {
  if ("showhidden" in d) {
    openHiddenJobs();
    return;
  }
  if (d.unhide) {
    unhideJobs([d.unhide]);
    toast("Back in your feed", "ok");
    hiddenListed().length ? openHiddenJobs() : closeSheet();
    return;
  }
  if ("unhideall" in d) {
    const n = Object.keys(U.hidden).length;
    unhideJobs(Object.keys(U.hidden));
    closeSheet();
    toast(`${n} job${n === 1 ? "" : "s"} back in your feed`, "ok");
    return;
  }
  if ("hjclose" in d) {
    closeSheet();
    return;
  }
});
