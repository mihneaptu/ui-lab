# mihneaptu/lab

A minimal, monochrome playground for UI animations. Each page under
[`animations/`](animations/) holds one hand-built effect — no frameworks,
no build step, just HTML and CSS.

**Live site:** https://mihneaptu.github.io/ui-lab/

## Experiments

| Experiment | Notes |
| --- | --- |
| [Melting button](animations/melting-button/index.html) | A button that melts on hover, shown as a side-by-side comparison of two implementations |

## Running locally

There is nothing to install. Serve the folder with any static file server
and open the printed URL:

```sh
python -m http.server 8000
```

> [!TIP]
> The theme toggle in the header follows your OS light/dark preference by
> default and remembers your last choice in `localStorage`.

## Project layout

```
index.html            The lab homepage — a card per experiment
animations/           One folder per effect
styles/               Shared design tokens and base styles
scripts/              The tiny theme switcher
docs/                 Design notes behind each experiment
```
