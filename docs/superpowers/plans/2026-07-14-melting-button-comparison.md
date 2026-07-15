# Melting Button Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive side-by-side comparison that preserves the current Fable 5 melt on the left and adds the polished two-second GPT-5.6 Sol melt on the right.

**Architecture:** Keep the production implementation page-local in animations/melting-button/index.html. Two labeled specimen sections reserve stable space for independently removable buttons; one shared attachMelt(button) controller reads each button’s terminal animation and fallback duration from data attributes. A Python Playwright unittest suite drives the real page in Chromium and verifies layout, isolation, timing, themes, keyboard activation, and reduced motion.

**Tech Stack:** HTML5, CSS Grid and CSS animations, vanilla JavaScript, Python 3.11 unittest, Playwright for Python

## Global Constraints

- Runtime code remains dependency-free: plain HTML, CSS, and JavaScript only.
- Modify only animations/melting-button/index.html and create tests/test_melting_button.py.
- Do not modify animations/melting-button/buttons.css, index.html, styles/tokens.css, styles/base.css, or scripts/theme.js.
- The exact persistent titles are “Fable 5” on the left and “GPT-5.6 Sol” on the right.
- The comparison is two equal columns above 640 px and one column at 640 px or less.
- Each button slot is 160 px high; titles remain after either button disappears.
- Fable 5 preserves its current normal-motion visuals and 3,400 ms completion.
- GPT-5.6 Sol targets 2,000 ms and leaves no puddle.
- Light melt color remains #7c3aed; dark melt color remains #a78bfa.
- Reduced-motion completion is no more than 100 ms for either version.
- Do not introduce transition: all; limit will-change to transform, opacity, and filter.

Protected-file SHA-256 baselines:

~~~text
C298AD89080E9C4E8F206779D39ECD39D044C6637CE7A55E2626B0628424DE9A animations/melting-button/buttons.css
C02FC195AAA584B080C221851FD181983948FEC39A80DCB480BD71E7FD8E3F3A index.html
F4A813DEA48F1C05A614D578B87852BBC95262370956BA3AEF74DF583BFC1CF5 styles/tokens.css
33511739DA61CE2C00BBB45F4C55896B5F30EDAA05EF86F52132782BD3705A53 styles/base.css
F86B1480CFEFEA7696C7EF17ECE55FFFAB81574CFC4212A2D234F98C2E7187DB scripts/theme.js
~~~

---

## File Structure

- Create tests/test_melting_button.py: real-browser regression coverage and its isolated local HTTP server.
- Modify animations/melting-button/index.html: comparison markup, page-local layout, both melt implementations, and shared per-button lifecycle controller.
- Leave animations/melting-button/buttons.css unchanged: it remains the primitive button system consumed by both specimens.

### Task 1: Build the stable comparison shell

**Files:**
- Create: tests/test_melting_button.py
- Modify: animations/melting-button/index.html:25-130

**Interfaces:**
- Consumes: existing btn, btn-primary, btn-md, is-melting, infect, melt, and drip definitions.
- Produces: melt-comparison, melt-specimen, melt-title, melt-slot, data-melt, data-terminal-animation, data-fallback-ms, and attachMelt(button) for Task 2.

- [ ] **Step 1: Write failing layout and independent-state browser tests**

Create tests/test_melting_button.py with:

~~~python
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class MeltingButtonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        handler = partial(QuietHandler, directory=str(ROOT))
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.server_thread = threading.Thread(
            target=cls.server.serve_forever,
            daemon=True,
        )
        cls.server_thread.start()
        cls.page_url = (
            f"http://127.0.0.1:{cls.server.server_address[1]}"
            "/animations/melting-button/index.html"
        )

        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=2)

    def open_page(
        self,
        *,
        width=900,
        height=700,
        theme="light",
        reduced_motion="no-preference",
    ):
        context = self.browser.new_context(
            color_scheme=theme,
            reduced_motion=reduced_motion,
            viewport={"width": width, "height": height},
        )
        self.addCleanup(context.close)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.add_init_script(
            f"localStorage.setItem('theme', '{theme}')"
        )
        page.goto(self.page_url, wait_until="networkidle")
        return page, errors

    def test_comparison_layout_and_persistent_titles(self):
        desktop, desktop_errors = self.open_page(width=641)
        titles = desktop.locator(".melt-title")
        slots = desktop.locator(".melt-slot")

        self.assertEqual(titles.all_text_contents(), ["Fable 5", "GPT-5.6 Sol"])
        self.assertEqual(desktop.locator(".melt-button").count(), 2)
        self.assertEqual(
            desktop.get_by_role("button", name="Button").count(),
            2,
        )
        self.assertAlmostEqual(
            titles.nth(0).bounding_box()["y"],
            titles.nth(1).bounding_box()["y"],
            delta=1,
        )
        self.assertLess(
            titles.nth(0).bounding_box()["x"],
            titles.nth(1).bounding_box()["x"],
        )
        self.assertAlmostEqual(
            slots.nth(0).bounding_box()["height"],
            160,
            delta=1,
        )
        self.assertAlmostEqual(
            slots.nth(1).bounding_box()["height"],
            160,
            delta=1,
        )

        before = [
            titles.nth(index).bounding_box()
            for index in range(2)
        ]
        desktop.locator('[data-melt="fable"]').evaluate(
            "element => element.remove()"
        )
        after = [
            titles.nth(index).bounding_box()
            for index in range(2)
        ]

        for before_box, after_box in zip(before, after):
            self.assertAlmostEqual(before_box["x"], after_box["x"], delta=1)
            self.assertAlmostEqual(before_box["y"], after_box["y"], delta=1)

        mobile, mobile_errors = self.open_page(width=640, height=1000)
        mobile_titles = mobile.locator(".melt-title")

        self.assertEqual(
            mobile_titles.all_text_contents(),
            ["Fable 5", "GPT-5.6 Sol"],
        )
        self.assertLess(
            mobile_titles.nth(0).bounding_box()["y"],
            mobile_titles.nth(1).bounding_box()["y"],
        )
        self.assertGreater(
            mobile_titles.nth(1).bounding_box()["y"]
            - mobile_titles.nth(0).bounding_box()["y"],
            200,
        )
        self.assertEqual(desktop_errors, [])
        self.assertEqual(mobile_errors, [])

    def test_buttons_activate_independently_and_ignore_repeat_clicks(self):
        page, errors = self.open_page()
        fable = page.locator('[data-melt="fable"]')
        sol = page.locator('[data-melt="sol"]')

        page.evaluate(
            """() => {
              window.__meltTimeoutCount = 0;
              const originalSetTimeout = window.setTimeout;
              window.setTimeout = (...args) => {
                window.__meltTimeoutCount += 1;
                return originalSetTimeout(...args);
              };
            }"""
        )

        fable.dispatch_event("click")
        fable.dispatch_event("click")

        self.assertIn("is-melting", fable.get_attribute("class"))
        self.assertNotIn("is-melting", sol.get_attribute("class"))
        self.assertEqual(fable.get_attribute("aria-disabled"), "true")
        self.assertIsNone(sol.get_attribute("aria-disabled"))
        self.assertEqual(page.evaluate("window.__meltTimeoutCount"), 1)
        self.assertEqual(page.locator(".melt-title").count(), 2)
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
~~~

- [ ] **Step 2: Run the tests and verify they fail on the single-button page**

Run:

~~~powershell
python -m unittest discover -s tests -p "test_melting_button.py" -v
~~~

Expected: two failures because the page has no melt-title elements and no data-melt="fable" button.

- [ ] **Step 3: Add the responsive comparison layout**

Replace the current body layout rules at the start of the inline style block with:

~~~css
/* A centered comparison stage with room for the fixed back link. */
body {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: var(--space-8) var(--space-6) var(--space-6);
}

.melt-comparison {
  width: min(720px, calc(100vw - 64px));
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: var(--space-8);
  align-items: start;
}

.melt-specimen {
  min-width: 0;
  display: grid;
  grid-template-rows: auto 160px;
  row-gap: var(--space-5);
  text-align: center;
}

.melt-title {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.2;
  color: var(--ink);
}

.melt-slot {
  height: 160px;
  display: grid;
  place-items: center;
}

@media (max-width: 640px) {
  .melt-comparison {
    width: min(320px, calc(100vw - 64px));
    grid-template-columns: minmax(0, 1fr);
    row-gap: var(--space-7);
  }
}
~~~

Keep the current melt CSS immediately after these layout rules.

- [ ] **Step 4: Replace the single button with two labeled specimens**

Keep the existing back link, then replace the single button with:

~~~html
<main class="melt-comparison" aria-label="Melting button comparison">
  <section class="melt-specimen" aria-labelledby="fable-title">
    <h2 class="melt-title" id="fable-title">Fable 5</h2>
    <div class="melt-slot">
      <button
        class="btn btn-primary btn-md melt-button melt-button--fable"
        type="button"
        data-melt="fable"
        data-terminal-animation="melt"
        data-fallback-ms="3600"
      >Button</button>
    </div>
  </section>

  <section class="melt-specimen" aria-labelledby="sol-title">
    <h2 class="melt-title" id="sol-title">GPT-5.6 Sol</h2>
    <div class="melt-slot">
      <button
        class="btn btn-primary btn-md melt-button melt-button--sol"
        type="button"
        data-melt="sol"
        data-terminal-animation="melt"
        data-fallback-ms="3600"
      >Button</button>
    </div>
  </section>
</main>
~~~

- [ ] **Step 5: Replace the single-button script with the shared controller**

Replace the current inline script with:

~~~html
<script>
  function attachMelt(button) {
    const terminalAnimation = button.dataset.terminalAnimation;
    const fallbackMs = Number(button.dataset.fallbackMs);
    let isMelting = false;
    let removalTimer;

    function removeButton() {
      window.clearTimeout(removalTimer);
      button.remove();
    }

    button.addEventListener("click", () => {
      if (isMelting) return;

      isMelting = true;
      button.setAttribute("aria-disabled", "true");
      button.classList.add("is-melting");
      removalTimer = window.setTimeout(removeButton, fallbackMs);
    });

    button.addEventListener("animationend", (event) => {
      if (
        event.target === button
        && event.animationName === terminalAnimation
      ) {
        removeButton();
      }
    });
  }

  document.querySelectorAll(".melt-button").forEach(attachMelt);
</script>
~~~

Both buttons intentionally use the current Fable animation in this task. Task 2 replaces only the right specimen’s internals and terminal animation.

- [ ] **Step 6: Run the browser tests**

Run:

~~~powershell
python -m unittest discover -s tests -p "test_melting_button.py" -v
~~~

Expected: PASS; two tests run successfully.

- [ ] **Step 7: Verify scope and commit**

Run:

~~~powershell
git add --intent-to-add animations/melting-button/index.html tests/test_melting_button.py
git diff --check
git diff -- animations/melting-button/index.html tests/test_melting_button.py
Get-FileHash -Algorithm SHA256 animations/melting-button/buttons.css,index.html,styles/tokens.css,styles/base.css,scripts/theme.js | ForEach-Object { "{0} {1}" -f $_.Hash, (Resolve-Path -Relative $_.Path) }
~~~

Expected: no whitespace errors; the diff shows the comparison and tests; every protected-file hash exactly matches the baseline in Global Constraints.

Then commit:

~~~powershell
git add animations/melting-button/index.html tests/test_melting_button.py
git commit -m "feat: add melting button comparison"
~~~

Expected: commit succeeds with the experiment page and browser test only.

### Task 2: Preserve Fable 5 and add GPT-5.6 Sol

**Files:**
- Modify: tests/test_melting_button.py
- Modify: animations/melting-button/index.html

**Interfaces:**
- Consumes: Task 1’s data-melt values, attachMelt(button), data-terminal-animation, data-fallback-ms, persistent headings, and fixed slots.
- Produces: the scoped Fable terminal animation melt and GPT-5.6 Sol animations sol-lifecycle, sol-shell, sol-label, sol-drop-left, and sol-drop-right.

- [ ] **Step 1: Add failing animation-contract tests**

Insert these methods inside MeltingButtonTests after test_buttons_activate_independently_and_ignore_repeat_clicks:

~~~python
    def test_concurrent_timings_and_clean_removal(self):
        page, errors = self.open_page()
        fable = page.locator('[data-melt="fable"]')
        sol = page.locator('[data-melt="sol"]')
        start = page.evaluate("performance.now()")

        fable.click()
        sol.click()

        self.assertEqual(
            fable.evaluate(
                "element => getComputedStyle(element).animationName"
            ),
            "infect, melt",
        )
        self.assertEqual(
            fable.evaluate(
                "element => getComputedStyle(element).animationDuration"
            ),
            "2s, 0.8s",
        )
        self.assertEqual(
            fable.evaluate(
                "element => getComputedStyle(element).animationDelay"
            ),
            "0s, 2.6s",
        )
        self.assertEqual(
            fable.evaluate(
                "element => getComputedStyle(element).animationTimingFunction"
            ),
            "ease-in, ease-out",
        )
        self.assertEqual(
            fable.evaluate(
                "element => "
                "getComputedStyle(element, '::before').animationDelay"
            ),
            "1.7s",
        )
        self.assertEqual(
            fable.evaluate(
                "element => "
                "getComputedStyle(element, '::before').animationDuration"
            ),
            "1.1s",
        )
        self.assertEqual(
            fable.evaluate(
                "element => "
                "getComputedStyle(element, '::after').animationDelay"
            ),
            "2s",
        )
        self.assertEqual(
            fable.evaluate(
                "element => "
                "getComputedStyle(element, '::after').animationDuration"
            ),
            "0.95s",
        )
        self.assertEqual(
            sol.evaluate(
                "element => getComputedStyle(element).animationName"
            ),
            "sol-lifecycle",
        )
        self.assertEqual(
            sol.evaluate(
                "element => "
                "getComputedStyle(element, '::before').animationName"
            ),
            "sol-shell",
        )

        page.wait_for_timeout(900)

        self.assertLess(
            float(
                page.locator(".sol-label").evaluate(
                    "element => getComputedStyle(element).opacity"
                )
            ),
            0.2,
        )
        self.assertGreater(
            float(
                page.locator(".sol-drop-left").evaluate(
                    "element => getComputedStyle(element).opacity"
                )
            ),
            0.05,
        )
        self.assertNotEqual(
            sol.evaluate(
                "element => "
                "getComputedStyle(element, '::before').transform"
            ),
            "none",
        )

        page.wait_for_selector(
            '[data-melt="sol"]',
            state="detached",
            timeout=1500,
        )
        sol_elapsed = page.evaluate("performance.now()") - start

        self.assertGreaterEqual(sol_elapsed, 1850)
        self.assertLessEqual(sol_elapsed, 2150)
        self.assertEqual(fable.count(), 1)
        self.assertEqual(page.locator(".melt-title").count(), 2)

        page.wait_for_selector(
            '[data-melt="fable"]',
            state="detached",
            timeout=1600,
        )
        fable_elapsed = page.evaluate("performance.now()") - start

        self.assertGreaterEqual(fable_elapsed, 3250)
        self.assertLessEqual(fable_elapsed, 3550)
        self.assertEqual(page.locator(".melt-title").count(), 2)
        self.assertEqual(page.locator(".sol-drop").count(), 0)
        self.assertEqual(errors, [])

    def test_melt_color_matches_each_theme(self):
        expected_colors = {
            "light": "#7c3aed",
            "dark": "#a78bfa",
        }

        for theme, expected in expected_colors.items():
            with self.subTest(theme=theme):
                page, errors = self.open_page(theme=theme)
                actual = page.evaluate(
                    "() => getComputedStyle(document.documentElement)"
                    ".getPropertyValue('--melt').trim()"
                )

                self.assertEqual(actual, expected)
                self.assertEqual(errors, [])

    def test_reduced_motion_and_keyboard_activation(self):
        page, errors = self.open_page(reduced_motion="reduce")
        fable = page.locator('[data-melt="fable"]')
        sol = page.locator('[data-melt="sol"]')
        start = page.evaluate("performance.now()")

        fable.press("Enter")
        sol.press("Enter")

        fable_durations = fable.evaluate(
            """element => getComputedStyle(element).animationDuration
              .split(',')
              .map(value => parseFloat(value) * 1000)"""
        )
        sol_duration = sol.evaluate(
            "element => "
            "parseFloat(getComputedStyle(element).animationDuration) * 1000"
        )

        self.assertLessEqual(max(fable_durations), 100)
        self.assertLessEqual(sol_duration, 100)

        page.wait_for_function(
            "() => document.querySelectorAll('.melt-button').length === 0",
            timeout=300,
        )
        elapsed = page.evaluate("performance.now()") - start

        self.assertLessEqual(elapsed, 250)
        self.assertEqual(
            page.locator(".melt-title").all_text_contents(),
            ["Fable 5", "GPT-5.6 Sol"],
        )
        self.assertEqual(page.locator(".sol-drop").count(), 0)
        self.assertEqual(errors, [])
~~~

- [ ] **Step 2: Run the expanded suite and verify the right animation fails**

Run:

~~~powershell
python -m unittest discover -s tests -p "test_melting_button.py" -v
~~~

Expected: the two Task 1 tests and theme test pass; test_concurrent_timings_and_clean_removal fails because the right animation is still infect, melt rather than sol-lifecycle; the reduced-motion test fails because the current fade retains its 2.6-second delay.

- [ ] **Step 3: Give GPT-5.6 Sol its liquid-layer markup**

Replace only the button inside the GPT-5.6 Sol melt-slot with:

~~~html
<button
  class="btn btn-primary btn-md melt-button melt-button--sol"
  type="button"
  data-melt="sol"
  data-terminal-animation="sol-lifecycle"
  data-fallback-ms="2200"
>
  <span class="sol-label">Button</span>
  <span
    class="sol-drop sol-drop-left"
    aria-hidden="true"
  ></span>
  <span
    class="sol-drop sol-drop-right"
    aria-hidden="true"
  ></span>
</button>
~~~

- [ ] **Step 4: Scope Fable 5 and add the polished liquid CSS**

Replace the complete current melt block, from its “The melt” comment through the drip keyframes, with:

~~~css
/* --- Shared melt color -------------------------------------------------- */

:root {
  --melt: #7c3aed;
}

[data-theme="dark"] {
  --melt: #a78bfa;
}

/* --- Fable 5: preserved baseline --------------------------------------- */

.melt-button--fable.is-melting {
  position: relative;
  pointer-events: none;
  background-image: linear-gradient(
    to bottom,
    var(--melt) 90%,
    transparent
  );
  background-repeat: no-repeat;
  background-position: top;
  background-size: 100% 0%;
  animation:
    infect 2s ease-in forwards,
    melt 0.8s ease-out 2.6s forwards;
}

@keyframes infect {
  70% {
    background-color: var(--accent);
  }
  100% {
    background-color: var(--melt);
    background-size: 100% 140%;
  }
}

@keyframes melt {
  to {
    opacity: 0;
  }
}

.melt-button--fable.is-melting::before,
.melt-button--fable.is-melting::after {
  content: "";
  position: absolute;
  top: 96%;
  width: 10px;
  height: 12px;
  border-radius: 50%;
  background: var(--melt);
  opacity: 0;
  animation: drip 1.1s ease-in forwards;
}

.melt-button--fable.is-melting::before {
  left: 22%;
  animation-delay: 1.7s;
}

.melt-button--fable.is-melting::after {
  left: 64%;
  animation-delay: 2s;
  animation-duration: 0.95s;
}

@keyframes drip {
  0% {
    opacity: 1;
    transform: translateY(-6px) scale(0.4);
  }
  70% {
    opacity: 1;
    transform: translateY(48px) scale(1, 1.6);
  }
  100% {
    opacity: 0;
    transform: translateY(84px) scale(0.7, 1.9);
  }
}

/* --- GPT-5.6 Sol: polished liquid shell -------------------------------- */

.melt-button--sol {
  position: relative;
  isolation: isolate;
  overflow: visible;
}

.melt-button--sol::before {
  content: "";
  position: absolute;
  inset: -1.5px;
  z-index: 0;
  border-radius: inherit;
  background-color: var(--accent);
  background-image: linear-gradient(
    to bottom,
    var(--melt) 0%,
    var(--melt) 88%,
    transparent 100%
  );
  background-repeat: no-repeat;
  background-position: top;
  background-size: 100% 0%;
  opacity: 0;
  pointer-events: none;
  transform-origin: 50% 100%;
}

.sol-label {
  position: relative;
  z-index: 2;
  transform-origin: center;
}

.sol-drop {
  position: absolute;
  top: calc(100% - 6px);
  z-index: 1;
  width: 6px;
  height: 11px;
  border-radius: 48% 52% 62% 58%;
  background: var(--melt);
  opacity: 0;
  pointer-events: none;
  transform-origin: 50% 0%;
}

.sol-drop-left {
  left: 25%;
  width: 7px;
}

.sol-drop-right {
  right: 21%;
  width: 5px;
  height: 9px;
}

.melt-button--sol.is-melting,
.melt-button--sol.is-melting:hover,
.melt-button--sol.is-melting:active {
  background-color: transparent;
  border-color: transparent;
  pointer-events: none;
  transform: none;
  transition: none;
  animation: sol-lifecycle 2s linear forwards;
}

.melt-button--sol.is-melting::before {
  animation: sol-shell 2s cubic-bezier(0.2, 0, 0, 1) forwards;
  will-change: transform, opacity, filter;
}

.melt-button--sol.is-melting .sol-label {
  animation: sol-label 700ms cubic-bezier(0.2, 0, 0, 1) forwards;
  will-change: transform, opacity, filter;
}

.melt-button--sol.is-melting .sol-drop-left {
  animation:
    sol-drop-left 1s cubic-bezier(0.35, 0, 0.25, 1) 620ms forwards;
  will-change: transform, opacity, filter;
}

.melt-button--sol.is-melting .sol-drop-right {
  animation:
    sol-drop-right 850ms cubic-bezier(0.35, 0, 0.25, 1) 790ms forwards;
  will-change: transform, opacity, filter;
}

@keyframes sol-lifecycle {
  from,
  to {
    opacity: 1;
  }
}

@keyframes sol-shell {
  0% {
    background-color: var(--accent);
    background-size: 100% 0%;
    border-radius: var(--radius-md);
    filter: blur(0);
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
  8% {
    background-size: 100% 14%;
    transform: translate3d(0, 1px, 0) scale(0.96);
  }
  18% {
    background-size: 100% 55%;
    border-radius: 10px 10px 12px 9px;
    transform: translate3d(0, 2px, 0) scaleX(0.99) scaleY(1.02);
  }
  34% {
    background-color: var(--melt);
    background-size: 100% 140%;
    border-radius: 9px 10px 15px 11px;
    transform: translate3d(0, 4px, 0) scaleX(0.97) scaleY(1.08);
  }
  52% {
    background-color: var(--melt);
    background-size: 100% 140%;
    border-radius: 8px 9px 18px 13px;
    transform: translate3d(-1px, 9px, 0) scaleX(0.9) scaleY(1.15);
  }
  68% {
    border-radius: 8px 10px 17px 14px;
    filter: blur(0.25px);
    opacity: 1;
    transform: translate3d(1px, 17px, 0) scaleX(0.76) scaleY(0.78);
  }
  82% {
    border-radius: 7px 9px 20px 16px;
    filter: blur(0.9px);
    opacity: 0.82;
    transform: translate3d(0, 25px, 0) scaleX(0.5) scaleY(0.4);
  }
  100% {
    border-radius: 999px;
    filter: blur(3px);
    opacity: 0;
    transform: translate3d(0, 32px, 0) scaleX(0.16) scaleY(0.08);
  }
}

@keyframes sol-label {
  0%,
  20% {
    filter: blur(0);
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  32% {
    filter: blur(0);
    opacity: 1;
    transform: translateY(1px) scale(0.96);
  }
  64% {
    filter: blur(0.6px);
    opacity: 0.62;
    transform: translateY(2px) scale(0.95);
  }
  100% {
    filter: blur(2px);
    opacity: 0;
    transform: translateY(3px) scale(0.94);
  }
}

@keyframes sol-drop-left {
  0% {
    filter: blur(0);
    opacity: 0;
    transform: translateY(-4px) scale(0.45, 0.15);
  }
  12% {
    opacity: 1;
    transform: translateY(-2px) scale(0.55, 0.8);
  }
  46% {
    opacity: 1;
    transform: translateY(16px) scale(0.7, 1.7);
  }
  74% {
    filter: blur(0.25px);
    opacity: 0.84;
    transform: translateY(34px) scale(0.52, 1.15);
  }
  100% {
    filter: blur(1.5px);
    opacity: 0;
    transform: translateY(52px) scale(0.25, 0.45);
  }
}

@keyframes sol-drop-right {
  0% {
    filter: blur(0);
    opacity: 0;
    transform: translateY(-3px) scale(0.4, 0.2);
  }
  14% {
    opacity: 1;
    transform: translateY(-1px) scale(0.52, 0.9);
  }
  50% {
    opacity: 1;
    transform: translateY(13px) scale(0.64, 1.5);
  }
  76% {
    filter: blur(0.2px);
    opacity: 0.8;
    transform: translateY(27px) scale(0.48, 1);
  }
  100% {
    filter: blur(1.25px);
    opacity: 0;
    transform: translateY(43px) scale(0.22, 0.4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .melt-button--fable.is-melting {
    animation-delay: 0ms, 0ms !important;
    animation-duration: 80ms, 80ms !important;
  }

  .melt-button--fable.is-melting::before,
  .melt-button--fable.is-melting::after {
    animation-delay: 0ms !important;
    animation-duration: 80ms !important;
  }

  .melt-button--sol.is-melting,
  .melt-button--sol.is-melting::before {
    animation-delay: 0ms !important;
    animation-duration: 80ms !important;
  }

  .melt-button--sol.is-melting .sol-label {
    animation-delay: 0ms !important;
    animation-duration: 60ms !important;
  }

  .melt-button--sol.is-melting .sol-drop {
    display: none;
  }
}
~~~

- [ ] **Step 5: Run the full browser suite**

Run:

~~~powershell
python -m unittest discover -s tests -p "test_melting_button.py" -v
~~~

Expected: PASS; five tests run successfully. The versions animate independently and concurrently, Fable 5 completes within 3,250–3,550 ms, GPT-5.6 Sol completes within 1,850–2,150 ms, both reduced-motion durations are at most 100 ms, and both titles persist.

- [ ] **Step 6: Inspect representative frames in both themes**

Start a local server if port 8765 is free:

~~~powershell
Start-Process -FilePath python -ArgumentList '-m','http.server','8765','--bind','127.0.0.1' -WorkingDirectory 'C:\Users\Home\Desktop\Projects\ui-lab' -WindowStyle Hidden
~~~

Use the Playwright browser harness to open http://127.0.0.1:8765/animations/melting-button/index.html and capture:

- Rest: titles aligned, Fable 5 left, GPT-5.6 Sol right, identical button geometry.
- 200 ms after both clicks: Fable begins its original top-down infection; Sol visibly compresses to approximately scale(0.96).
- 800 ms: Fable remains mostly dark while Sol is purple, its label is nearly gone, and its lower edge is asymmetrical.
- 1,400 ms: Fable remains in its original infection phase while Sol collapses with two restrained strands.
- 2,100 ms: Sol is absent, Fable is still running, and both titles remain fixed.
- 3,500 ms: both buttons are absent, both titles remain, and neither slot contains a fragment.

Repeat the rest, 800 ms, and completion captures in dark mode. Also inspect a 640 px viewport to confirm vertical ordering.

- [ ] **Step 7: Verify scope and commit**

Run:

~~~powershell
git diff --check
git diff -- animations/melting-button/index.html tests/test_melting_button.py
Get-FileHash -Algorithm SHA256 animations/melting-button/buttons.css,index.html,styles/tokens.css,styles/base.css,scripts/theme.js | ForEach-Object { "{0} {1}" -f $_.Hash, (Resolve-Path -Relative $_.Path) }
~~~

Expected: no whitespace errors; every protected-file hash exactly matches the baseline in Global Constraints.

Then commit:

~~~powershell
git add animations/melting-button/index.html tests/test_melting_button.py
git commit -m "feat: add polished melting comparison"
~~~

Expected: commit succeeds with only the experiment page and browser test.

## Final Verification

Run:

~~~powershell
python -m unittest discover -s tests -p "test_melting_button.py" -v
git diff --check HEAD^ HEAD
git status --short
Get-FileHash -Algorithm SHA256 animations/melting-button/buttons.css,index.html,styles/tokens.css,styles/base.css,scripts/theme.js | ForEach-Object { "{0} {1}" -f $_.Hash, (Resolve-Path -Relative $_.Path) }
~~~

Expected: five passing browser tests, no whitespace errors in the final commit, no unexpected tracked changes, and protected-file hashes matching Global Constraints.
