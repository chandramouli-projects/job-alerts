/* Resume: upload a PDF / Word file (Profile page, or the skills question when setting up), keep it,
   and pick skills from it. The person sees the skills found and chooses which to add. */
let resumeBusy = false,
  resumeErr = "",
  resumeTarget = "profile";
const RESUME_ACCEPT =
  ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";
const resumeInput = Object.assign(document.createElement("input"), {
  type: "file",
  accept: RESUME_ACCEPT,
  hidden: true,
  id: "resumeInput",
});
document.body.appendChild(resumeInput);
resumeInput.onchange = () => {
  const f = resumeInput.files[0];
  resumeInput.value = "";
  if (f) useResume(f);
};

/* Profile page card */
function resumeCard() {
  const R = U.profile.resumeFile,
    kind = R && resumeKind(R.name);
  const body = resumeBusy
    ? `<div class="rs-busy" role="status"><span class="rs-spin"></span>Reading your resume…</div>`
    : R
      ? `<div class="rs-file"><span class="rs-ico" data-kind="${esc(kind || "")}">${ICON.file}<b>${esc(RESUME_KINDS[kind] || "File")}</b></span>
        <div class="rs-name"><b title="${esc(R.name)}">${esc(R.name)}</b><small>${fileSize(R.size || 0)} · Uploaded ${fmtDate(R.at)}${SERVER ? "" : " · Kept in this browser"}</small></div>
        <div class="rs-acts"><button type="button" class="btn ghost sm" data-rsview>${kind === "docx" ? "Download" : "View"}</button>
          <button type="button" class="btn ghost sm" data-rsupload="profile">Replace</button>
          <button type="button" class="btn danger sm" data-rsremove aria-label="Remove resume">Remove</button></div></div>
      <div class="rs-foot"><span>Added new skills to your resume?</span><button type="button" class="linkbtn" data-rsscan>Find skills again</button></div>`
      : `<button type="button" class="rs-drop" data-rsupload="profile"><span class="rs-up">${ICON.upload}</span>
        <b>Upload your resume</b><span>Drag it here or click to choose · PDF or Word (.docx), up to 2 MB</span></button>`;
  return `<div class="card" id="resumeCard"><div class="rs-head"><h3>Resume</h3></div>${body}
    <div class="err" id="resumeErr" role="alert">${esc(resumeErr)}</div></div>`;
}
function refreshResume() {
  if (view === "profile" && !$("shell").hidden && $("resumeCard")) $("resumeCard").outerHTML = resumeCard();
  if (!$("ob").hidden) renderObResume();
}

/* Setting up: a short line under "What are your skills?" */
function renderObResume() {
  const R = U.profile.resumeFile,
    box = $("obResume");
  if (!box) return;
  box.innerHTML = resumeBusy
    ? `<span class="rs-busy sm" role="status"><span class="rs-spin"></span>Reading your resume…</span>`
    : `<button type="button" class="btn ghost sm rs-obbtn" data-rsupload="ob">${ICON.upload}${R ? "Upload another resume" : "Fill from my resume"}</button>
      <span class="meta">${R ? `${esc(R.name)} uploaded` : "PDF or Word · we pick the skills for you"}</span>${resumeErr ? `<div class="err" role="alert">${esc(resumeErr)}</div>` : ""}`;
}

/* Upload: check, keep the file, read it, then show the skills found */
async function useResume(file) {
  resumeErr = resumeProblem(file);
  if (resumeErr) {
    refreshResume();
    return;
  }
  resumeBusy = true;
  refreshResume();
  let text = "",
    readErr = "";
  try {
    U.profile.resumeFile = await storeResume(file);
    saveUser();
  } catch (e) {
    resumeBusy = false;
    resumeErr = e.message;
    refreshResume();
    return;
  }
  try {
    text = await resumeText(file);
  } catch (e) {
    readErr = e.message;
  }
  resumeBusy = false;
  refreshResume();
  showFoundSkills(file.name, text, readErr);
}
function currentSkills() {
  return resumeTarget === "ob" ? draft.skills : mySkills(U.prefs);
}
let foundNew = [];
function showFoundSkills(name, text, readErr) {
  const found = findSkills(text),
    have = currentSkills(),
    known = s => have.some(h => h === s || hasWord(h, s) || hasWord(s, h));
  foundNew = found.filter(s => !known(s));
  const already = found.filter(known);
  const why =
    readErr ||
    (text.trim().length < 40
      ? "No text was found in it. It may be a scanned picture: upload a PDF made from Word or Google Docs instead."
      : "");
  const body = why
    ? `<div class="rs-note">${ICON.file}<div><b>Your resume is saved, but we couldn't read skills from it.</b><p>${esc(why)}</p></div></div>`
    : !found.length
      ? `<div class="rs-note">${ICON.file}<div><b>Your resume is saved.</b><p>No skills found in it. Add them yourself.</p></div></div>`
      : `<p class="rs-sub">We found <b>${found.length} skill${found.length === 1 ? "" : "s"}</b> in ${esc(name)}.${foundNew.length ? " Choose the ones to add to your profile." : " They are all in your profile already."}</p>
      ${
        foundNew.length
          ? `<div class="rs-pickhead"><span>New skills</span><button type="button" class="linkbtn" data-rsall>Select all</button></div>
        <div class="rs-chips">${foundNew.map(s => `<button type="button" class="rs-chip" data-rsk="${esc(s)}" aria-pressed="true">${esc(s)}</button>`).join("")}</div>`
          : ""
      }
      ${already.length ? `<div class="rs-pickhead"><span>Already in your profile</span></div><div class="rs-chips">${already.map(s => `<span class="rs-chip have">${esc(s)}</span>`).join("")}</div>` : ""}`;
  openSheet(
    "Skills from your resume",
    body,
    foundNew.length && !why
      ? `<button class="btn ghost" data-rsskip>Not now</button><button class="btn" data-rsadd>Add ${foundNew.length} skill${foundNew.length === 1 ? "" : "s"}</button>`
      : `<button class="btn" data-rsskip>Done</button>`
  );
}
function pickedSkills() {
  return [...document.querySelectorAll('#sheet .rs-chip[aria-pressed="true"]')].map(b => b.dataset.rsk);
}
function updateAddButton() {
  const n = pickedSkills().length,
    b = document.querySelector("#sheet [data-rsadd]");
  if (b) {
    b.disabled = !n;
    b.textContent = n ? `Add ${n} skill${n === 1 ? "" : "s"}` : "Pick skills to add";
  }
}
function addFoundSkills() {
  const add = pickedSkills();
  if (resumeTarget === "ob") {
    draft.skills = [...new Set([...draft.skills, ...add])];
    pkField("skill");
  } else {
    U.prefs.skills = [...new Set([...U.prefs.skills, ...add])];
    saveUser();
    render();
  }
  closeSheet();
  toast(`Added ${add.length} skill${add.length === 1 ? "" : "s"} to your profile`, "ok");
}
async function viewResume() {
  const R = U.profile.resumeFile,
    inTab = resumeKind(R.name) !== "docx",
    w = inTab ? window.open("", "_blank") : null;
  try {
    const blob = await loadResume(),
      url = URL.createObjectURL(new Blob([blob], { type: R.type || blob.type }));
    if (w) w.location.href = url;
    else Object.assign(document.createElement("a"), { href: url, download: R.name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    w?.close();
    resumeErr = e.message;
    refreshResume();
  }
}

/* clicks: this works on the Profile page, while setting up, and in the skills pop-up */
document.addEventListener("click", async e => {
  const t = e.target.closest(
    "[data-rsupload],[data-rsview],[data-rsremove],[data-rsscan],[data-rsk],[data-rsall],[data-rsadd],[data-rsskip]"
  );
  if (!t || !session || !U) return;
  const d = t.dataset;
  if (d.rsupload) {
    if (resumeBusy) return;
    resumeTarget = d.rsupload;
    resumeErr = "";
    resumeInput.click();
    return;
  }
  if ("rsview" in d) {
    resumeErr = "";
    viewResume();
    return;
  }
  if ("rsremove" in d) {
    if (
      !(await ask(
        "Remove your resume?",
        "The file is deleted. The skills you added stay in your profile.",
        "Remove",
        true
      ))
    )
      return;
    try {
      await dropResume();
    } catch (err) {
      resumeErr = err.message;
      refreshResume();
      return;
    }
    delete U.profile.resumeFile;
    resumeErr = "";
    saveUser();
    refreshResume();
    toast("Resume removed");
    return;
  }
  if ("rsscan" in d) {
    resumeTarget = "profile";
    resumeErr = "";
    resumeBusy = true;
    refreshResume();
    try {
      const R = U.profile.resumeFile,
        file = new File([await loadResume()], R.name, { type: R.type });
      resumeBusy = false;
      refreshResume();
      let text = "",
        readErr = "";
      try {
        text = await resumeText(file);
      } catch (err) {
        readErr = err.message;
      }
      showFoundSkills(R.name, text, readErr);
    } catch (err) {
      resumeBusy = false;
      resumeErr = err.message;
      refreshResume();
    }
    return;
  }
  if (d.rsk) {
    t.setAttribute("aria-pressed", t.getAttribute("aria-pressed") !== "true");
    updateAddButton();
    return;
  }
  if ("rsall" in d) {
    document
      .querySelectorAll("#sheet .rs-chip[data-rsk]")
      .forEach(b => b.setAttribute("aria-pressed", "true"));
    updateAddButton();
    return;
  }
  if ("rsadd" in d) {
    addFoundSkills();
    return;
  }
  if ("rsskip" in d) {
    closeSheet();
    return;
  }
});

/* drag a file onto the upload box */
document.addEventListener("dragover", e => {
  const z = e.target.closest?.(".rs-drop");
  if (z) {
    e.preventDefault();
    z.classList.add("over");
  }
});
document.addEventListener("dragleave", e => {
  e.target.closest?.(".rs-drop")?.classList.remove("over");
});
document.addEventListener("drop", e => {
  const z = e.target.closest?.(".rs-drop");
  if (!z) return;
  e.preventDefault();
  z.classList.remove("over");
  const f = e.dataTransfer.files[0];
  if (f && !resumeBusy) {
    resumeTarget = "profile";
    useResume(f);
  }
});
