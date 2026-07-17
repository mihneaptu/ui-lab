/* rainbow-tag.js — the "interactive" tag answers touch directly.

   On desktop the rainbow is a hover flourish, and hover is free: the
   pointer wanders over, the tint fades in, no click gets spent. A
   finger has no hover — the only way to address the tag was the same
   tap that opens the card, navigation always won, and the rainbow
   was unreachable on phones.

   So on touch the tag claims its tap: pressing it lights the tint
   for one full pass of the gradient (2.5s, matching the drift loop)
   instead of opening the exhibit, and a re-tap restarts the clock.
   The rest of the card still navigates — a missed tap does the safe
   default. Mouse clicks fall through to the link like before.

   Delegated from document like haptics.js, and gated the same way:
   modern Chromium fires click as a PointerEvent, so the input type
   that caused it rides along. The whisper haptic still plays — the
   tag sits inside the card's <a>, and preventDefault cancels the
   navigation, not the click haptics.js listens for. */

(function () {
  document.addEventListener("click", (event) => {
    if (event.pointerType !== "touch") return;

    const tag = event.target.closest(".card-tag");
    if (!tag || !tag.querySelector(".card-tag-rainbow")) return;

    event.preventDefault(); // the card link sits this one out

    tag.classList.add("is-lit");
    clearTimeout(Number(tag.dataset.litTimer));
    tag.dataset.litTimer = setTimeout(() => {
      tag.classList.remove("is-lit");
      delete tag.dataset.litTimer;
    }, 2500);
  });
})();
