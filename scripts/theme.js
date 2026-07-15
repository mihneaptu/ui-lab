/* theme.js — the light/dark switch.

   The theme is stored as a data-theme attribute on <html>, which is what
   tokens.css keys its dark override on. The attribute is already set by
   the time this script runs — a tiny inline script in each page's <head>
   does that before first paint, so the page never flashes the wrong theme.

   This file only has to do one job: make the header button flip the
   attribute and remember the choice for next visit. */

const root = document.documentElement;
const toggle = document.querySelector(".theme-toggle");
const calmMotion = matchMedia("(prefers-reduced-motion: reduce)");

/* The button carries no text — its content is the morphing sun/moon
   icon, and the icon IS the state (base.css keys the two poses off
   the data-theme attribute this script flips). If a page ever wants a
   text label again, it goes in a .tt-label span so writing it can't
   wipe out the svg. */
const label = toggle.querySelector(".tt-label");

function updateLabel() {
  if (label) {
    label.textContent = root.dataset.theme === "dark" ? "light" : "dark";
  }
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  updateLabel();
}

/* A component color transition can keep its clock stopped if the document
   is frozen in the back/forward cache or throttled in a background tab.
   Cancel only visual-color transitions before taking a theme snapshot, so
   an old chip border or button fill cannot leak into it. Movement
   (transform) is deliberately left alone: a hover lift should not snap. */
const themedProps = new Set([
  "color",
  "background-color",
  "border-color",
  "box-shadow",
  "fill",
  "stroke",
  "-webkit-text-fill-color",
]);

function settleThemedTransitions() {
  document.getAnimations().forEach((anim) => {
    const prop = anim.transitionProperty;
    if (prop && themedProps.has(prop)) {
      anim.cancel();
    }
  });
}

/* Navigation is the one moment where movement may snap safely: the page
   is disappearing anyway. Clear every CSS transition BEFORE the browser
   freezes this document, so a hover lift or icon morph cannot be restored
   later with an old clock and contaminate the next theme fade. */
function settleAllTransitions() {
  document.getAnimations().forEach((anim) => {
    if (anim.transitionProperty) {
      anim.cancel();
    }
  });
}

/* Switch the real DOM atomically, then force pending styles to resolve and
   cancel the COLOR transitions that data-theme just started: the wipe must
   reveal a finished theme, not chips and borders still fading toward it.
   Movement is deliberately kept alive — ::view-transition-new(root) renders
   the LIVE page, not a frozen snapshot, so the chip's sun/moon morph plays
   inside the reveal exactly where the circle starts growing. Cancelling all
   transitions here (an earlier version did) snapped the icon straight to
   its final pose and the wipe emanated from a teleporting moon. */
function applyThemeAndSettle(theme) {
  applyTheme(theme);
  void toggle.offsetWidth;
  settleThemedTransitions();
}

let activeThemeTransition;

function finishThemeTransition(transition) {
  if (activeThemeTransition !== transition) return;
  activeThemeTransition = undefined;
  root.classList.remove("theme-transitioning");
}

/* Animate the captured NEW theme as a circle growing from the sun/moon
   control. A pixel belongs to either the complete old theme or the complete
   new one; ink and paper never interpolate through the same gray.

   Pacing: revealed AREA grows with the radius squared, so a hard ease-out
   on the radius compounds into a bang — the whole screen flipped in the
   first ~120ms and the remaining time crawled over the far corner. The
   symmetric ease (the same curve the chip's disc morphs with) spends the
   quiet opening on the icon's own morph, sweeps the page through the
   middle, and settles into the corner instead of stalling there. */
function animateThemeReveal(transition, x, y, radius) {
  transition.ready.then(() => {
    root.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${radius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 500,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        pseudoElement: "::view-transition-new(root)",
      }
    );
  }).catch(() => {
    /* The DOM update still succeeds if the browser skips the visual layer. */
  });
}

toggle.addEventListener("click", () => {
  const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
  settleThemedTransitions();

  /* A second click completes the previous reveal before starting a new
     one, so no stale snapshot survives to fight the new target. */
  activeThemeTransition?.skipTransition?.();

  if (!document.startViewTransition || calmMotion.matches) {
    root.classList.remove("theme-transitioning");
    applyThemeAndSettle(nextTheme);
    return;
  }

  const rect = toggle.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y)
  );

  root.classList.add("theme-transitioning");
  const transition = document.startViewTransition(() => {
    applyThemeAndSettle(nextTheme);
  });

  activeThemeTransition = transition;
  animateThemeReveal(transition, x, y, radius);
  transition.finished.then(
    () => finishThemeTransition(transition),
    () => finishThemeTransition(transition)
  );
});

function prepareForSuspension() {
  activeThemeTransition?.skipTransition?.();
  activeThemeTransition = undefined;
  root.classList.remove("theme-transitioning");
  settleAllTransitions();
}

/* pagehide runs while the old page is still live, just before it can be
   placed in the back/forward cache. Cleaning here is more reliable than
   trying to repair already-frozen transitions after the page returns. */
window.addEventListener("pagehide", prepareForSuspension);

/* Coming back through the back/forward cache revives the page exactly as
   it was left, while the theme may have changed on another page meanwhile
   (the sun-moon exhibit is a theme switch too). Re-sync without animating:
   a page you ARRIVE on should already be dressed, not getting dressed. */
window.addEventListener("pageshow", () => {
  activeThemeTransition = undefined;
  root.classList.remove("theme-transitioning");
  const saved = localStorage.getItem("theme");
  if (saved && saved !== root.dataset.theme) {
    root.dataset.theme = saved;
  }
  updateLabel();
  /* Updating data-theme can itself create the icon's transform
     transitions. Cancel after the sync so restoration lands directly on
     the real pose instead of starting another half-visible animation. */
  settleAllTransitions();
});

/* Tabs also get frozen WITHOUT a navigation (Opera GX snoozes background
   tabs). Settle on the way out, before the animation clock is paused; the
   visible-side sweep remains as a safety net for browsers that skip the
   hidden notification. */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    prepareForSuspension();
    return;
  }

  settleThemedTransitions();
});

updateLabel();
