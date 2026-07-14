# Melting Button Comparison Design

**Date:** 2026-07-14
**Status:** Approved for planning

## Goal

Turn the melting-button experiment into a direct comparison between the current animation and a new polished liquid version. The current animation appears on the left under the exact title “Fable 5.” The new animation appears on the right under the exact title “GPT-5.6 Sol.”

Each button melts independently and disappears. Both titles remain visible above their reserved empty spaces after either button is removed.

## Current project baseline

- The experiment lives at animations/melting-button/index.html.
- Its button primitives live at animations/melting-button/buttons.css.
- The homepage links to the experiment from an Animations gallery.
- A fixed back link returns from the experiment to the homepage.

The implementation must preserve this structure and the existing homepage and back-link changes.

## Scope and constraints

- Keep runtime code dependency-free: plain HTML, CSS, and JavaScript only.
- Keep comparison layout and melt styles page-local in animations/melting-button/index.html.
- Do not modify animations/melting-button/buttons.css, the shared tokens, the shared base styles, the homepage, or the theme script.
- Preserve the current Fable 5 animation’s normal-motion appearance and timing.
- Preserve the existing theme-specific melt colors: #7c3aed in light mode and #a78bfa in dark mode.
- Prevent repeated activation after an individual button starts melting.
- Honor prefers-reduced-motion with a clean disappearance lasting no more than 100 ms for either version.

## Comparison layout

Use one centered comparison grid with a maximum width of 720 px, two equal minmax(0, 1fr) columns, and a 64 px column gap. Each column is an independent labeled specimen containing:

1. A persistent heading.
2. A 160 px-high button slot.
3. One independently controlled button.

The left heading reads “Fable 5” and the right heading reads “GPT-5.6 Sol.” Both use the existing body typeface at 15 px and weight 600. A 24 px gap separates each heading from its slot. Equal column widths and equal slot heights keep the titles and buttons aligned.

Removing a button must not collapse its column or move either title. At viewport widths of 640 px or less, the grid becomes one column with a 48 px row gap in the same order: Fable 5 first, GPT-5.6 Sol second. The existing fixed back link remains unchanged.

## Fable 5 behavior

Fable 5 is the current animation, preserved as the comparison baseline:

- Purple infection grows downward for 2 seconds.
- The first drop starts at 1.7 seconds.
- The second drop starts at 2 seconds.
- The final fade starts at 2.6 seconds and ends at 3.4 seconds.
- The button is removed when the existing terminal fade completes.

The existing selectors and keyframes may be scoped or renamed only as needed to prevent them from affecting GPT-5.6 Sol. Those changes must not alter Fable 5’s normal-motion visuals, easing, or timing.

## GPT-5.6 Sol behavior

GPT-5.6 Sol uses a CSS silhouette melt targeting exactly 2,000 ms:

1. **Press, 0–160 ms:** The visible shell compresses to scale(0.96) and moves down slightly without bounce.
2. **Liquefy, 120–700 ms:** Purple moves through the shell faster than Fable 5. The label fades and softens while the lower edge becomes asymmetrical.
3. **Collapse, 550–1,550 ms:** The shell narrows, stretches downward, and loses height from the top. Two asymmetrical strands, each 5–7 px wide, detach at different times without splashing.
4. **Disappear, 1,350–2,000 ms:** The remaining silhouette sinks a short distance, gains a small blur, and fades to zero without leaving a puddle.

The phases overlap so the result reads as one liquid transformation. A pseudo-element owns the deforming shell, a label span fades independently, and two aria-hidden spans own the strands. The button element remains a stable interaction container until removal.

## Interaction and lifecycle

Each button has its own activation guard and terminal animation:

- Clicking one button does not start, alter, or remove the other.
- Activation sets aria-disabled="true" and disables pointer interaction for that button.
- CSS owns the visible animation.
- JavaScript filters animationend events by the correct terminal animation and removes only the completed button.
- A 3,600 ms timeout backs up Fable 5 removal, and a 2,200 ms timeout backs up GPT-5.6 Sol removal if a terminal event does not fire.
- Refreshing the page restores both buttons.

The headings and 160 px slots are outside the removable button elements, so they remain stable after either animation completes.

## Accessibility and resilience

- Each persistent heading labels its specimen.
- Both controls remain native buttons with the accessible name “Button.”
- Decorative GPT-5.6 Sol liquid elements are hidden from assistive technology.
- Keyboard activation starts the same animation as pointer activation.
- Reduced-motion mode skips the staged transformation and removes the activated button within 100 ms.
- No broad transition: all rule is introduced.
- will-change is limited to transform, opacity, and filter on actively animating liquid layers.

## Verification

- Verify the titles are exact, remain visible after button removal, and stay aligned on desktop.
- Verify the specimens stack Fable 5 before GPT-5.6 Sol at 640 px and remain side by side at 641 px.
- Verify Fable 5 retains its current animation names or equivalent scoped names, timing, easing, color sweep, two drops, and 3,400 ms completion with a tolerance of 150 ms.
- Verify GPT-5.6 Sol shows the press, liquefy, asymmetric collapse, two restrained strands, and clean disappearance within 2,000 ms with a tolerance of 150 ms.
- Verify each button can animate independently and both can run concurrently.
- Verify light mode, dark mode, keyboard activation, repeated-click guards, and reduced-motion behavior.
- Confirm no button or decorative fragment remains after completion, no title moves, and no console error occurs.
- Confirm the homepage, back link, button primitives, global tokens, and global base styles are unchanged.
