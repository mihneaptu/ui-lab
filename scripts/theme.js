/* theme.js — the light/dark switch.

   The theme is stored as a data-theme attribute on <html>, which is what
   tokens.css keys its dark override on. The attribute is already set by
   the time this script runs — a tiny inline script in each page's <head>
   does that before first paint, so the page never flashes the wrong theme.

   This file only has to do one job: make the header button flip the
   attribute and remember the choice for next visit. */

const root = document.documentElement;
const toggle = document.querySelector(".theme-toggle");

/* The button is labeled with the theme you'd SWITCH TO, not the one
   you're in — a button describes the action it performs. */
function updateLabel() {
  toggle.textContent = root.dataset.theme === "dark" ? "light" : "dark";
}

toggle.addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", root.dataset.theme);
  updateLabel();
});

updateLabel();
