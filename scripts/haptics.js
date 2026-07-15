/* haptics.js — touch feedback, choreographed to the animations.

   Android phones expose navigator.vibrate; iPhones never got it. The
   web-haptics library (github.com/lochie/web-haptics) papers over the
   gap: on Android it drives navigator.vibrate with our pattern as-is,
   and on iOS it clicks a hidden switch control — the system toggle
   haptic is the one tick Safari will produce, so that's what plays.
   If the library fails to load (offline, CDN down), the plain
   navigator.vibrate fallback below keeps Android working like before.

   Only the exhibits buzz, and only at the moment the hand causes
   something physical on screen — the theme morph committing, a melt
   starting. Plain navigation stays quiet.

   A pattern is [buzz, pause, buzz, pause, …] in ms. Strength can't be
   controlled, only duration — so "light" is short (6–10ms) and "firm"
   is slightly longer (12–16ms). Anything past ~20ms stops feeling
   like a tick and starts feeling like a phone call. (On iOS the
   durations collapse into single system ticks; the rhythm survives
   even though the weights don't.)

   Everything is delegated from document, so one script serves every
   page: it only acts on elements that exist. */

(function () {
  /* Loaded eagerly, not on first tap: iOS only plays its tick inside
     a user gesture, and a network fetch on the first tap would land
     the haptic seconds late, outside the gesture and out of sync
     with the animation it belongs to. */
  let haptics = null;
  import("https://esm.sh/web-haptics@0.0.6")
    .then(({ WebHaptics }) => {
      haptics = new WebHaptics();
    })
    .catch(() => {
      /* stay null — buzz() falls back to navigator.vibrate */
    });

  /* Reduced motion is treated as reduced SENSATION: someone who asked
     the OS to calm the screen down shouldn't get buzzed instead.
     Checked live at tap time, not once at load, so flipping the OS
     setting mid-session is honored. */
  const calm = matchMedia("(prefers-reduced-motion: reduce)");

  function buzz(pattern) {
    if (calm.matches) return;

    if (haptics) {
      /* intensity 1 skips the library's on/off modulation, so Android
         gets the exact navigator.vibrate pattern we tuned — the
         library's only job here is the iOS fallback. */
      haptics.trigger(pattern, { intensity: 1 });
    } else if ("vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  }

  /* Only real fingers get haptics. Modern Chrome fires click as a
     PointerEvent, so the input type that caused it rides along —
     mouse and keyboard activations fall through silently. */
  function fromTouch(event) {
    return event.pointerType === "touch";
  }

  /* --- The patterns, one per exhibit ----------------------------------

     theme morph (header chip / sun-moon exhibit):
       a tick as the rays sink on press, then a firmer pulse ~130ms in,
       right as the mask's bite carves the crescent — the moment the
       morph "commits". Same shape both directions; at this scale the
       carve and the heal weigh the same in the hand.

     melting buttons: one tick on the press that starts the melt, then
       the hand goes quiet and the eye takes over — the drips are the
       screen's drama, not the phone's. */

  const patterns = {
    theme: [6, 120, 12], /* press … carve */
    melt:  10,           /* press, then watch */
  };

  document.addEventListener("click", (event) => {
    if (!fromTouch(event)) return;

    const melt = event.target.closest(".melt-button");
    if (melt) {
      /* The page's own click handler runs first (it's on the button,
         this one is on document), so on the tap that STARTS a melt,
         is-melting is already set by the time we look. Requiring it
         means the pattern only plays for a tap that actually melted
         something; the played flag keeps it to exactly once even if a
         stray tap slips in before pointer-events: none takes hold. */
      if (melt.classList.contains("is-melting") &&
          !melt.dataset.hapticsPlayed) {
        melt.dataset.hapticsPlayed = "true";
        buzz(patterns.melt);
      }
      return;
    }

    if (event.target.closest(".theme-toggle, .sky-toggle")) {
      buzz(patterns.theme);
    }
  });
})();
