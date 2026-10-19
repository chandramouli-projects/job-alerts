/* One modern tooltip for the whole app, instead of the browser's plain "title" box.
   Works for any element with data-tip="…" (or an old title="…", which is moved to data-tip so the
   browser's own box doesn't show too). Shows above the element, or below when there is no room,
   and stays inside the screen. */
const tipBox = Object.assign(document.createElement("div"), { className: "tip", role: "tooltip" });
tipBox.hidden = true;
document.body.appendChild(tipBox);
let tipFor = null,
  tipTimer = 0;

function tipTarget(el) {
  const t = el?.closest?.("[data-tip],[title]");
  if (!t || t.closest("svg")) return null;
  if (t.hasAttribute("title")) {
    t.dataset.tip = t.getAttribute("title");
    t.removeAttribute("title");
  }
  return t.dataset.tip ? t : null;
}

function showTip(t) {
  tipFor = t;
  tipBox.textContent = t.dataset.tip;
  tipBox.hidden = false;
  tipBox.classList.remove("on");
  const r = t.getBoundingClientRect(),
    b = tipBox.getBoundingClientRect(),
    gap = 8;
  const below = r.top - b.height - gap < 8;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - b.width / 2), innerWidth - b.width - 8);
  tipBox.style.left = left + "px";
  tipBox.style.top = (below ? r.bottom + gap : r.top - b.height - gap) + "px";
  tipBox.style.setProperty("--arrow", r.left + r.width / 2 - left + "px");
  tipBox.classList.toggle("below", below);
  requestAnimationFrame(() => tipBox.classList.add("on"));
}

function hideTip() {
  clearTimeout(tipTimer);
  tipFor = null;
  tipBox.hidden = true;
  tipBox.classList.remove("on");
}

document.addEventListener("mouseover", e => {
  const t = tipTarget(e.target);
  if (t === tipFor) return;
  hideTip();
  if (t) tipTimer = setTimeout(() => showTip(t), 350);
});
document.addEventListener("focusin", e => {
  const t = tipTarget(e.target);
  if (t && e.target.matches(":focus-visible")) showTip(t);
});
document.addEventListener("focusout", hideTip);
document.addEventListener("mousedown", hideTip);
document.addEventListener("keydown", e => e.key === "Escape" && hideTip());
addEventListener("scroll", hideTip, true);
