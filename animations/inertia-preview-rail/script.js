/* Inertia preview rail

   One strip, one spring. The track's translate is a physical body: a drag
   measures its own velocity and hands it to the spring on release, so the
   strip glides on (the inertia) while the spring settles the nearest
   preview into the center (the selection). Keys, clicks, and the wheel
   all feed the same body — retargeting mid-flight is the point of physics
   over keyframes.

   Reduced motion removes the whole premise: no inertia, no spring — the
   strip tracks the hand 1:1 and snaps straight to the selection. */

const calm = matchMedia("(prefers-reduced-motion: reduce)");
const rail = document.querySelector("[data-preview-rail]");
const track = document.querySelector("[data-rail-track]");
const items = [...track.querySelectorAll("[data-rail-item]")];
const meta = document.querySelector("[data-rail-meta]");
const metaNo = meta.querySelector("[data-meta-no]");
const metaName = meta.querySelector("[data-meta-name]");
const metaNote = meta.querySelector("[data-meta-note]");

/* The spring. k is stiffness (1/s²), c is damping (1/s); together they set
   the damping ratio ζ = c / (2√k) ≈ 0.7 — one polite overshoot (~5%) on
   arrival, then still. The selected position is the rail's midline:
   targetFor(i) is the translate that centers item i there. */
const K = 150;
const C = 17;
const V_MAX = 5200;         // px/s — a throttled frame can't slingshot it

const DRAG_THRESHOLD = 6;   // px of wander that turns a press into a drag
const RUBBER = 0.35;        // past an end, travel counts only this much
const RUBBER_MAX = 44;      // px — the most the band stretches
const FLING_LOOKAHEAD = 0.14; // s of release velocity folded into the pick
const FLING_MAX = 2800;     // px/s — a wild fling still reads as a glide

const WHEEL_IDLE = 140;     // ms of wheel silence that ends a wheel gesture
const WHEEL_STEP_MAX = 180; // px — one event can never jump the strip
const LINE_PX = 33;         // a deltaMode "line" in px, for cross-browser parity

let index = Math.max(0, items.findIndex(
  (o) => o.getAttribute("aria-selected") === "true"
));

let centers = [];   // each item's center in track coordinates, px
let railMid = 0;    // the rail's midline in the same frame
let x = 0, v = 0, target = 0; // the spring's state, in px of translate
let rafId = null, lastT = 0;

let pid = null;         // the one pointer we follow; others are ignored
let held = false;       // press became a drag past the threshold: it owns the strip
let dragStartX = 0, dragStartPX = 0, dragStartPY = 0;
let lastPX = 0, lastPT = 0, dragV = 0; // the hand's velocity trail
let suppressClick = false; // a drag's ghost click must not re-select
let gestureTouch = false;  // did a finger start this interaction?

let wheeling = false, wheelTimer = 0;
let wheelV = 0, lastWheelT = 0; // the wheel's velocity trail

/* --- Geometry ------------------------------------------------------------- */

function measure() {
  /* centers[] start at the track's left edge, which is the rail's CONTENT
     box — but the midline the selection centers on is the middle of the
     rail's PADDING box. The left padding sits between the two, so it
     comes out of the midline or every selection would land padL px right
     of true center. */
  const padL = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
  railMid = rail.clientWidth / 2 - padL;
  /* offsetLeft/offsetWidth ignore transforms, so the strip's current
     flight never corrupts the map — the same reason the segmented
     control measures its options, not its thumb. */
  centers = items.map((o) => o.offsetLeft + o.offsetWidth / 2);
}

function targetFor(i) { return railMid - centers[i]; }
function minX() { return targetFor(items.length - 1); } // last item centered
function maxX() { return targetFor(0); }                // first item centered

/* The selection is positional, not gestural: whoever's target sits
   nearest to where the strip is headed. Distance in translate space is
   distance on screen, so this is "nearest preview to the midline". */
function nearestIndex(p) {
  let best = 0, dist = Infinity;
  for (let i = 0; i < items.length; i++) {
    const d = Math.abs(p - targetFor(i));
    if (d < dist) { dist = d; best = i; }
  }
  return best;
}

/* Past an end the strip stretches like a band: a third of the extra
   travel, capped, so the wall is felt long before it is hit. */
function rubber(raw) {
  if (raw < minX()) return Math.max(minX() + (raw - minX()) * RUBBER, minX() - RUBBER_MAX);
  if (raw > maxX()) return Math.min(maxX() + (raw - maxX()) * RUBBER, maxX() + RUBBER_MAX);
  return raw;
}

function render() {
  track.style.transform = `translate3d(${x}px, 0, 0)`;
}

function syncAria() {
  items.forEach((o, j) => {
    o.setAttribute("aria-selected", String(j === index));
    o.tabIndex = j === index ? 0 : -1;
  });
  metaNo.textContent =
    `${String(index + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}`;
  metaName.textContent = items[index].dataset.name;
  metaNote.textContent = items[index].dataset.note;
}

/* One funnel for every way the selection can change: click, keys, fling,
   or the wheel coming to rest. The commit is atomic — index, aria, and
   metadata move together, mid-flight retargets included. */
function goTo(i) {
  const changed = i !== index;
  index = i;
  target = targetFor(i);
  if (changed) {
    syncAria();
    /* the commit tick — the firm tier from haptics.js, only when a
       finger caused it. Fling commits happen at pointerup and taps at
       click, both inside the gesture, so the iOS switch-tick still
       has its activation. */
    if (gestureTouch) window.labBuzz?.(12);
  }
  if (calm.matches) {
    x = target; v = 0; render();
    return;
  }
  wake();
}

/* --- The spring -------------------------------------------------------------
   One body, one axis, semi-implicit Euler — the same integrator the lab's
   other exhibits ride: velocity from the spring force FIRST, then
   position. One rAF loop total; anything that owns the strip (a drag, a
   wheel gesture) stops it and restarts it on release. */

function wake() {
  if (rafId === null && !calm.matches) {
    lastT = performance.now();
    rafId = requestAnimationFrame(tick);
  }
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function tick(t) {
  /* clamp dt so a throttled background tab can't slingshot the strip */
  const dt = Math.min((t - lastT) / 1000, 0.032);
  lastT = t;

  if (held || wheeling) { rafId = null; return; } // a hand owns x

  v += (-K * (x - target) - C * v) * dt;
  if (v > V_MAX) v = V_MAX;
  else if (v < -V_MAX) v = -V_MAX;
  x += v * dt;

  /* The end-stops: the strip doesn't pass through the wall, it knocks on
     it — a third of the impact speed comes back. */
  if (x < minX()) { x = minX(); v = Math.abs(v) * 0.32; }
  else if (x > maxX()) { x = maxX(); v = -Math.abs(v) * 0.32; }

  if (Math.abs(x - target) < 0.05 && Math.abs(v) < 4) {
    x = target;
    v = 0;
    render();
    rafId = null;
    return;
  }

  render();
  rafId = requestAnimationFrame(tick);
}

/* --- Drag and fling ---------------------------------------------------------
   A press arms a possible click; wander past the threshold and it becomes
   a drag that owns the strip. Capture starts only then: Chromium retargets
   the compatibility click to the capture element, so capturing on the
   press itself would cost plain taps their click. On release the hand's
   smoothed velocity folds into the pick — the strip lands on the preview
   nearest to where it was HEADED, not where it happened to be let go. */

rail.addEventListener("pointerdown", (e) => {
  if (pid !== null) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  pid = e.pointerId;
  suppressClick = false;
  gestureTouch = e.pointerType === "touch";
  dragStartPX = e.clientX;
  dragStartPY = e.clientY;
  dragStartX = x;
  lastPX = e.clientX;
  lastPT = performance.now();
  dragV = 0;
});

rail.addEventListener("pointermove", (e) => {
  if (e.pointerId !== pid) return;
  const now = performance.now();

  if (!held &&
      Math.hypot(e.clientX - dragStartPX, e.clientY - dragStartPY) > DRAG_THRESHOLD) {
    held = true;
    stopLoop(); // the hand owns x from here
    /* capture routes every move and the lift back here even if the
       pointer wanders off the strip mid-drag */
    rail.setPointerCapture(pid);
    rail.classList.add("is-dragging");
  }

  if (held) {
    x = rubber(dragStartX + (e.clientX - dragStartPX));
    /* the hand's velocity, smoothed: raw per-event deltas jitter too much
       to fling on, so they run through an EMA */
    const dt = (now - lastPT) / 1000;
    if (dt > 0.001) {
      dragV = dragV * 0.7 + ((e.clientX - lastPX) / dt) * 0.3;
    }
    render();
  }

  lastPX = e.clientX;
  lastPT = now;
});

function release(e, fling) {
  if (e.pointerId !== pid) return;
  pid = null;
  rail.classList.remove("is-dragging");

  if (held) {
    held = false;
    /* the drag is handled; the click event trailing it must not turn
       around and re-select whatever the press happened to start on */
    suppressClick = true;
    /* a paused hand carries no momentum: the EMA only updates on move
       events, so a drag that stopped moving a beat ago would otherwise
       fling with stale speed */
    const stale = performance.now() - lastPT > 100;
    const vv = fling && !stale
      ? Math.max(-FLING_MAX, Math.min(FLING_MAX, dragV))
      : 0; // a cancel's velocity is unreliable across browsers
    v = vv; // the spring inherits the hand's speed, never a jump
    goTo(nearestIndex(x + vv * FLING_LOOKAHEAD));
  }
}
rail.addEventListener("pointerup", (e) => release(e, true));
rail.addEventListener("pointercancel", (e) => release(e, false));

/* Clicks handle only what pointerup didn't: plain taps. */
rail.addEventListener("click", (e) => {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const o = e.target.closest("[data-rail-item]");
  if (!o || !rail.contains(o)) return;
  goTo(items.indexOf(o));
});

/* Listbox keys: arrows walk one preview, Home/End jump to the ends, and
   focus follows the selection. */
rail.addEventListener("keydown", (e) => {
  let next = null;
  if (e.key === "ArrowRight") next = Math.min(index + 1, items.length - 1);
  else if (e.key === "ArrowLeft") next = Math.max(index - 1, 0);
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = items.length - 1;
  if (next === null) return;
  e.preventDefault();
  gestureTouch = false; // keys aren't a finger, even after a tap
  goTo(next);
  items[next].focus({ preventScroll: true });
});

/* --- The wheel --------------------------------------------------------------
   Attached to the rail itself, so it can never touch the page's vertical
   scroll anywhere else — and even here it only claims input that is
   genuinely horizontal: a trackpad's sideways glide (deltaX dominant), or
   Shift turning a vertical wheel sideways. A plain vertical wheel over
   the strip stays the page's. The strip answers steps directly, and when
   the wheel falls silent the nearest preview settles in. */

rail.addEventListener("wheel", (e) => {
  if (e.ctrlKey) return; // a pinch-zoom gesture, not travel
  const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  const shifted = e.shiftKey && e.deltaY !== 0;
  if (!horizontal && !shifted) return;
  e.preventDefault();

  const unit = e.deltaMode === 1 ? LINE_PX : 1; // Firefox wheels in lines
  let d = (horizontal ? e.deltaX : e.deltaY) * unit;
  d = Math.max(-WHEEL_STEP_MAX, Math.min(WHEEL_STEP_MAX, d));

  /* the wheel's velocity, same EMA smoothing as the hand's — in TRACK
     coordinates: positive deltas move the strip toward -x, so the sign
     flips here or the spring would inherit a push AWAY from the glide.
     A long pause between notches is a new gesture, not a slow one. */
  const now = performance.now();
  const dt = (now - lastWheelT) / 1000;
  if (dt > 0.001 && dt < 0.2) {
    wheelV = wheelV * 0.7 + (-d / dt) * 0.3;
  } else {
    wheelV = 0;
  }
  lastWheelT = now;

  if (!wheeling) {
    wheeling = true;
    gestureTouch = false; // a wheel isn't a finger, even after a tap
    stopLoop(); // the wheel owns x until it falls silent
  }
  x = rubber(x - d);
  render();

  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => {
    wheeling = false;
    const vv = Math.max(-FLING_MAX, Math.min(FLING_MAX, wheelV));
    v = vv * 0.5; // wheels step more than they fling — hand the spring half
    goTo(nearestIndex(x));
    wheelV = 0;
  }, WHEEL_IDLE);
}, { passive: false });

/* --- Housekeeping ---------------------------------------------------------- */

measure();
x = target = targetFor(index);
render();
syncAria();

/* A resize re-does the geometry, and re-anchoring a spring nobody can
   watch mid-resize beats rescaling it: land the strip on its selection
   in the new geometry. */
window.addEventListener("resize", () => {
  measure();
  x = target = targetFor(index);
  v = 0;
  render();
});

/* Stop the spring before the document is frozen: rAF callbacks never fire
   in a hidden document, so a mid-flight strip would otherwise be cached
   away from its selection with a dead clock. Landing it is invisible —
   the page is going away anyway. A grip simply ends: the hand is gone. */
function settleForSuspension() {
  stopLoop();
  if (pid !== null) {
    pid = null;
    held = false;
    rail.classList.remove("is-dragging");
  }
  clearTimeout(wheelTimer);
  wheeling = false;
  x = target;
  v = 0;
  render();
}

window.addEventListener("pagehide", settleForSuspension);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") settleForSuspension();
});
