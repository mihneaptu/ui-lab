# Polished Melting Button Design

**Date:** 2026-07-14
**Status:** Approved for planning

## Goal

Improve the button experiment in `components/buttons/index.html` so its click animation reads as a polished liquid melt. The full sequence should complete in about two seconds and end with the button disappearing cleanly. It must not leave a puddle or reform.

## Scope and constraints

- Keep the experiment dependency-free: plain HTML, CSS, and JavaScript only.
- Keep the melt styles page-local. Shared button rules in `components/buttons/buttons.css` and global design tokens remain unchanged.
- Preserve the existing light and dark theme behavior, including the theme-specific purple melt color.
- Preserve the button's accessible name and native button semantics until it is removed.
- Prevent repeated activation once the melt starts.
- Honor `prefers-reduced-motion` with a clean disappearance lasting no more than 100 ms.

## Chosen approach

Use a CSS silhouette melt rather than an SVG filter or JavaScript particle simulation. CSS layers provide enough control for a refined result while preserving the lab's small, dependency-free architecture.

The button remains the main liquid body. A label span allows the text to fade independently. A page-local color layer creates the liquid wash, while two decorative drop elements create restrained, asymmetrical strands. The body deforms with composited transforms, changing border radii, opacity, and a small amount of blur.

## Motion sequence

The animation lasts approximately 2 seconds and has four overlapping phases:

1. **Press, 0–160 ms:** The button compresses to `scale(0.96)` and moves down slightly, creating a tactile start without bounce.
2. **Liquefy, 120–700 ms:** Purple spreads through the button more quickly than the current two-second color sweep. The label fades and softens while the lower edge begins to sag asymmetrically.
3. **Collapse, 550–1,550 ms:** With its transform origin anchored at the bottom center, the body subtly narrows, stretches downward, and loses height from the top. Two narrow strands detach at different times and fall without bouncing or splashing.
4. **Disappear, 1,350–2,000 ms:** The remaining silhouette sinks a short distance, gains a restrained blur, and fades to zero. The final strand disappears with it, leaving no puddle or artifact.

The phases overlap so the motion reads as one physical transformation rather than separate color, drip, and fade animations.

## Markup and behavior

The button gains one label span and two `aria-hidden` decorative drop spans. No wrapper or external asset is required.

On click, JavaScript guards against duplicate activation, sets `aria-disabled="true"`, and adds the melting state class. CSS owns all visible motion. JavaScript removes the button only after the terminal disappearance animation ends, filtering unrelated `animationend` events.

## Accessibility and resilience

- The label remains the button's accessible name; decorative liquid elements are hidden from assistive technology.
- Pointer interaction is disabled during the sequence, and duplicate clicks are ignored in JavaScript.
- Reduced-motion mode shortens the transformation to a fade of 100 ms or less while preserving the same final removed state.
- Only `transform`, `opacity`, `filter`, background properties, and border radius animate. No broad `transition: all` rule is introduced.

## Verification

- Capture the resting state and representative frames near 0.2 s, 0.8 s, 1.4 s, and completion to verify the intended sequence.
- Verify the effect in both light and dark themes.
- Verify that the label fades before the body disappears and that the strands are asymmetrical and restrained.
- Verify that one click starts one sequence, extra clicks have no effect, and the button is removed 2,000 ms after activation with a tolerance of 150 ms.
- Verify reduced-motion behavior and confirm that no button or decorative fragment remains.
- Confirm there are no console errors and no changes to shared button specimens.
