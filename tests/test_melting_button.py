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

        self.assertEqual(fable.count(), 1)
        self.assertEqual(sol.count(), 1)

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

    def test_concurrent_timings_and_clean_removal(self):
        page, errors = self.open_page()
        fable = page.locator('[data-melt="fable"]')
        sol = page.locator('[data-melt="sol"]')
        page.evaluate(
            """() => {
              window.__meltTimings = {};

              for (const name of ['fable', 'sol']) {
                document
                  .querySelector('[data-melt="' + name + '"]')
                  .addEventListener('click', () => {
                    window.__meltTimings[name] = {
                      startedAt: performance.now(),
                    };
                  });
              }

              new MutationObserver(() => {
                for (const name of ['fable', 'sol']) {
                  const timing = window.__meltTimings[name];
                  if (
                    timing
                    && timing.endedAt === undefined
                    && !document.querySelector('[data-melt="' + name + '"]')
                  ) {
                    timing.endedAt = performance.now();
                  }
                }
              }).observe(document.body, {
                childList: true,
                subtree: true,
              });
            }"""
        )

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

        page.wait_for_timeout(200)

        self.assertEqual(
            sol.evaluate(
                "element => "
                "getComputedStyle(element, '::before').backgroundColor"
            ),
            "rgb(38, 38, 38)",
        )
        self.assertNotEqual(
            sol.evaluate(
                "element => "
                "getComputedStyle(element, '::before').backgroundSize"
            ),
            "100% 0%",
        )

        page.wait_for_timeout(700)

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

        page.wait_for_timeout(500)

        self.assertEqual(
            sol.evaluate(
                "element => "
                "getComputedStyle(element, '::before').backgroundColor"
            ),
            "rgb(124, 58, 237)",
        )

        page.wait_for_selector(
            '[data-melt="sol"]',
            state="detached",
            timeout=1500,
        )
        sol_elapsed = page.evaluate(
            "window.__meltTimings.sol.endedAt"
            " - window.__meltTimings.sol.startedAt"
        )

        self.assertGreaterEqual(sol_elapsed, 1850)
        self.assertLessEqual(sol_elapsed, 2150)
        self.assertEqual(fable.count(), 1)
        self.assertEqual(page.locator(".melt-title").count(), 2)

        page.wait_for_selector(
            '[data-melt="fable"]',
            state="detached",
            timeout=1600,
        )
        fable_elapsed = page.evaluate(
            "window.__meltTimings.fable.endedAt"
            " - window.__meltTimings.fable.startedAt"
        )

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
        fable_delays = fable.evaluate(
            """element => getComputedStyle(element).animationDelay
              .split(',')
              .map(value => parseFloat(value) * 1000)"""
        )
        sol_delays = sol.evaluate(
            """element => getComputedStyle(element).animationDelay
              .split(',')
              .map(value => parseFloat(value) * 1000)"""
        )

        self.assertLessEqual(max(fable_durations), 100)
        self.assertLessEqual(sol_duration, 100)
        self.assertLessEqual(max(fable_delays), 100)
        self.assertLessEqual(max(sol_delays), 100)

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


if __name__ == "__main__":
    unittest.main()
