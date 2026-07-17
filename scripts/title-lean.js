/* title-lean.js — hovering the headline leans it into an italic.

   Bricolage Grotesque ships no italic, and base.css forbids the browser
   from faking one (font-synthesis: none) — so the slant is built here
   instead. The script splits the title into letters and mounts each one
   on its own spring: entering the word starts a wave at the cursor that
   travels outward, tipping letters over to a true italic's 12° as it
   passes, each one overshooting a little and settling — the word is
   pushed into italic from where your pointer touched it, not swapped.
   Leaving plays the same wave from the exit point, standing the letters
   back up in order.

   While the cursor is inside, its motion combs the letters too: sweeping
   across the word flicks nearby tops in the direction of travel, and the
   springs pull them back to the pose. Hold still and nothing stirs — the
   wobble IS your hand's motion, echoed (same contract as the sun-moon
   exhibit's cursor jiggle, same integrator).

   On touch the finger plays the cursor's role directly: pressing the
   word is entering it (the lean wave starts under your finger), dragging
   combs the letters exactly like cursor motion, and lifting is leaving
   (the stand-up wave starts where the finger let go). A quick tap is
   just a very short visit — the recovery wave chases the lean wave out
   from the tap point, held one beat behind so every letter gets to tip
   before it's stood back up.

   The letters pivot from their feet (transform-origin in base.css), so
   the baseline never moves — tops swing, feet stay planted, which is how
   type actually leans. */

(function () {
  /* A request for stillness: the title stays one unsplit piece of text
     and this file does nothing. */
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const title = document.querySelector(".page-title");
  if (!title) return;

  /* Split the text into per-letter spans. The heading keeps its name for
     screen readers via aria-label; the letter spans are scenery. Spaces
     stay text nodes — an inline-block holding only a space collapses to
     zero width and the word gaps would vanish. */
  const text = title.textContent.trim();
  title.setAttribute("aria-label", text);
  title.textContent = "";

  const word = document.createElement("span");
  word.className = "lean-word";
  word.setAttribute("aria-hidden", "true");
  title.appendChild(word);

  /* One entry per springy letter: its element, its center (measured on
     entry, in px from the word's left edge), the spring state, and the
     poses the traveling waves will hand it when they arrive. */
  const letters = [];
  for (const ch of text) {
    if (/\s/.test(ch)) {
      word.appendChild(document.createTextNode(ch));
      continue;
    }
    const el = document.createElement("span");
    el.className = "lean-letter";
    el.textContent = ch;
    word.appendChild(el);
    letters.push({
      el, cx: 0,
      lean: 0, v: 0,          // degrees of italic slant, and its velocity
      target: 0,              // the pose the spring is pulling toward
      waves: [],              // poses in flight: [{ at, target }], sorted by at
      waveAt: 0,              // when the newest wave reaches (or reached) this letter
      gain: 0.75 + Math.random() * 0.5, // per-letter "mass" — see the shake below
    });
  }

  const LEAN = 12;        // degrees — a text face's italic slants about this
  const SPREAD = 1500;    // px/s — how fast the lean travels along the word
  const STIFFNESS = 380;  // spring pull toward the pose (1/s²)
  const DAMPING = 20;     // low enough that arrival overshoots ~15% (1/s)
  const REACH = 90;       // px — comb influence radius around the cursor
  const FLICK = 1.5;      // deg/s of lean per px of cursor travel
  const V_MAX = 260;      // deg/s — a wild swipe can't flatten a letter
  const DWELL = 160;      // ms — a tap's recovery wave trails the lean wave by
                          // this much per letter: about the spring's travel
                          // time, so each letter reaches full italic (plus its
                          // little overshoot) before being stood back up
  const SHAKE = 250;      // deg/s of lean per m/s² of sideways phone jolt
  const SHAKE_MIN = 2;    // m/s² — below this the phone is just being held

  let rect = null;  // the word's box, cached per hover (it never moves mid-hover)
  let lastX = null; // last cursor x inside the word, for the comb's deltas

  function measure() {
    rect = word.getBoundingClientRect();
    for (const l of letters) {
      const r = l.el.getBoundingClientRect();
      l.cx = r.left + r.width / 2 - rect.left;
    }
  }

  /* Start a wave at originX (px from the word's left edge) that flips
     each letter's pose as it passes — the flip itself happens in tick,
     so a leave can overwrite a still-traveling enter and the far letters
     simply never tip: the latest wave always wins. */
  function ripple(originX, target) {
    const now = performance.now();
    for (const l of letters) {
      const at = now + (Math.abs(l.cx - originX) / SPREAD) * 1000;
      l.waves = [{ at, target }];
      l.waveAt = at;
    }
    wake();
  }

  /* The tap-friendly variant: instead of overwriting a still-traveling
     wave, this one queues behind it, arriving no sooner than DWELL after
     the previous wave — so a tap's stand-up chases the lean out from the
     tap point and every letter gets its moment of italic. When there's
     nothing in flight (the finger was held a while) the clamp is moot
     and this degrades into a plain leave. */
  function rippleAfter(originX, target) {
    const now = performance.now();
    for (const l of letters) {
      const at = Math.max(
        now + (Math.abs(l.cx - originX) / SPREAD) * 1000,
        l.waveAt + DWELL
      );
      l.waves.push({ at, target });
      l.waveAt = at;
    }
    wake();
  }

  word.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "touch") return;
    /* remeasure every entry — a font swap or resize since the last
       hover would leave every cached center pointing at the wrong x */
    measure();
    ripple(e.clientX - rect.left, LEAN);
  });

  word.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "touch") return; // touch leaves via lift, below
    lastX = null; // forget the trail so re-entry isn't one giant delta
    if (rect === null) return;
    ripple(e.clientX - rect.left, 0);
  });

  /* --- The finger as cursor -------------------------------------------
     Touch pointers are implicitly captured on pointerdown, so once a
     press lands on the word, every move and the lift come back here even
     if the finger wanders off the letters — the gesture can't be lost
     mid-drag, only ended (lift) or taken by the scroll (cancel, which
     base.css permits only for vertical swipes via touch-action). */

  let touchId = null; // the one finger we follow; others are ignored

  word.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || touchId !== null) return;
    touchId = e.pointerId;
    measure();
    /* seed the trail at the press point — the press IS the position,
       unlike hover where the first move establishes it */
    lastX = e.clientX - rect.left;
    ripple(lastX, LEAN);
  });

  /* Lift and cancel both stand the word back up from wherever the finger
     last was — lastX rather than the event's coords, because a cancel's
     position is unreliable across browsers. */
  function lift(e) {
    if (e.pointerId !== touchId) return;
    touchId = null;
    rippleAfter(lastX, 0);
    lastX = null;
  }
  word.addEventListener("pointerup", lift);
  word.addEventListener("pointercancel", lift);

  word.addEventListener("pointermove", (e) => {
    /* touch combs only while the followed finger is down; hovers comb
       freely — either way it's the same physics below */
    if (e.pointerType === "touch" && e.pointerId !== touchId) return;
    if (rect === null) return;
    const x = e.clientX - rect.left;
    if (lastX !== null) {
      const dx = x - lastX;
      for (const l of letters) {
        const d = Math.abs(x - l.cx);
        if (d >= REACH) continue;

        /* smooth falloff: full strength on the letter, zero at REACH.
           Rightward travel pushes tops rightward — deeper into the
           lean — so combing WITH the italic exaggerates it a breath
           and combing against it stands letters briefly upright. */
        const f = 1 - (d / REACH) ** 2;
        l.v += dx * FLICK * f;
        if (l.v > V_MAX) l.v = V_MAX;
        else if (l.v < -V_MAX) l.v = -V_MAX;
      }
      wake();
    }
    lastX = x;
  });

  /* --- Shaking the phone ------------------------------------------------
     The letters pivot at their feet, so a sideways jolt tips them like
     tombstones on hinges: the phone lurches, the tops lag behind, the
     springs stand them back up. Only the horizontal axis can torque a
     hinged letter — vertical shakes pass straight through the hinge and
     do nothing, which is how it should feel. Each letter carries its
     own "mass" (gain, set at build): a uniform kick would rock the row
     in lockstep and read as the page sliding, not the word rattling.
     Motion sensors only exist on secure origins, and iOS additionally
     wants a permission prompt we won't show for an easter egg — in
     practice this is Android over HTTPS, and anywhere else the
     listener never hears a thing. */
  if (isSecureContext) {
    window.addEventListener("devicemotion", (e) => {
      const a = e.acceleration; // gravity already subtracted
      if (!a || a.x === null) return;
      if (Math.abs(a.x) < SHAKE_MIN) return; // held, not shaken
      /* interval is the sensor's sampling period, in MILLISECONDS */
      const dt = e.interval > 0 && e.interval < 100 ? e.interval / 1000 : 0.016;
      for (const l of letters) {
        /* the phone jerks right, the tops lag left — and vice versa */
        l.v += -a.x * SHAKE * l.gain * dt;
        if (l.v > V_MAX) l.v = V_MAX;
        else if (l.v < -V_MAX) l.v = -V_MAX;
      }
      wake();
    });
  }

  let rafId = null;
  let lastT = 0;

  function wake() {
    if (rafId === null) {
      lastT = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  function tick(t) {
    /* clamp dt so a throttled background tab can't slingshot a letter */
    const dt = Math.min((t - lastT) / 1000, 0.032);
    lastT = t;

    let alive = false;
    for (const l of letters) {
      /* deliver every wave that has arrived, in order — a tap parks two
         (lean, then stand-up) and they must land as the pair they are */
      while (l.waves.length > 0 && t >= l.waves[0].at) {
        l.target = l.waves.shift().target;
      }
      if (l.waves.length > 0) {
        alive = true; // a wave is still on its way to this letter
      }

      /* semi-implicit Euler: update velocity from the spring force and
         friction FIRST, then move — stabler than the naive order */
      const x = l.lean - l.target;
      l.v += (-STIFFNESS * x - DAMPING * l.v) * dt;
      l.lean += l.v * dt;

      if (Math.abs(l.lean - l.target) > 0.02 || Math.abs(l.v) > 0.4) {
        alive = true;
        /* negative skew leans tops rightward — the italic direction */
        l.el.style.transform = `skewX(${-l.lean}deg)`;
      } else {
        /* settled: snap off the residue and stop touching the style.
           Settled-at-italic keeps its exact pose; settled-upright clears
           the transform entirely so the resting title carries none. */
        l.lean = l.target;
        l.v = 0;
        const pose = l.target ? `skewX(${-l.target}deg)` : "";
        if (l.el.style.transform !== pose) l.el.style.transform = pose;
      }
    }

    rafId = alive ? requestAnimationFrame(tick) : null;
  }
})();
