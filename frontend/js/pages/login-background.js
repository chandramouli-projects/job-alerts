/* Login page background: builds the aurora glows, dot grid, orbit rings and particles into #authBg, and moves the soft spotlight with the mouse.
   All the movement is in css/login-background.css. */
(function () {
  const box = $("authBg");
  if (!box) return;
  // aurora glows: [color, strength %, left %, top %, seconds, drift x, drift y]
  const GLOWS = [
    ["--g1", 30, 12, 18, 26, "6vw", "5vh"],
    ["--g2", 34, 88, 24, 32, "-5vw", "6vh"],
    ["--g3", 40, 78, 88, 28, "-6vw", "-4vh"],
    ["--g4", 22, 18, 86, 36, "5vw", "-5vh"],
  ];
  const glows = GLOWS.map(
    ([c, a, x, y, t, dx, dy], i) =>
      `<span class="bg-glow" style="--c:var(${c});--a:${a}%;--x:${x}%;--y:${y}%;--t:${t}s;--d:-${i * 7}s;--dx:${dx};--dy:${dy}"></span>`
  );
  const orbits = `<span class="bg-orbit" style="--s:84vmax;--sm:560;--t:80s"></span><span class="bg-orbit" style="--s:112vmax;--sm:760;--t:120s;--dir:reverse"></span>`;
  // particles: [left %, size px, seconds, sideways drift px]
  const DOTS = [
    [6, 4, 14, 30],
    [15, 3, 18, -20],
    [24, 5, 16, 25],
    [33, 3, 20, -30],
    [46, 4, 15, 20],
    [55, 3, 19, -25],
    [63, 5, 17, 30],
    [72, 3, 21, -20],
    [81, 4, 16, 25],
    [90, 3, 18, -30],
    [96, 5, 20, 20],
    [40, 3, 22, -15],
  ];
  const dots = DOTS.map(
    ([x, s, t, dx], i) =>
      `<span class="bg-dot" style="--x:${x}%;--s:${s}px;--t:${t}s;--d:-${(i * 3.1) % t}s;--dx:${dx}px"></span>`
  );
  box.innerHTML =
    glows.join("") +
    `<span class="bg-grid"></span>` +
    orbits +
    dots.join("") +
    `<span class="bg-spot" id="authSpot"></span>`;

  // spotlight follows the mouse (desktop only), at most once per frame
  const spot = $("authSpot");
  if (!matchMedia("(pointer:fine)").matches || matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  let x = 0,
    y = 0,
    queued = false;
  $("auth").addEventListener("pointermove", e => {
    x = e.clientX;
    y = e.clientY;
    spot.classList.add("on");
    if (!queued) {
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        spot.style.transform = `translate(${x}px,${y}px)`;
      });
    }
  });
  $("auth").addEventListener("pointerleave", () => spot.classList.remove("on"));
})();
