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


if __name__ == "__main__":
    unittest.main()
