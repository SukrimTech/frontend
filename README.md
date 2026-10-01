# Sukrim — frontend

Vite + React. Two pages: an animated overview, and a console where you hand an
agent a model and a question.

## Running it

Two processes. The API first, from inside the **Sukrim** repo:

```bash
cd ~/Desktop/Sukrim
.venv/Ariadne/bin/python -m uvicorn backend.api:app --reload --port 8000
```

then this, from here:

```bash
npm run dev        # http://localhost:5173
```

Vite proxies `/api` to `127.0.0.1:8000`, so the frontend never needs to know a
host and a production build works unchanged wherever it is served from.

## Layout

```
src/
  App.jsx              router, nav, theme toggle
  api.js               the whole API surface, in one place
  styles.css           design tokens and every rule
  components/
    Pipeline.jsx       the animated importer → IR → engine diagram
    Reveal.jsx         one scroll reveal, so the page moves with one rhythm
  pages/
    Landing.jsx        the overview
    Console.jsx        upload, ask, run, read the report
```

## Notes

- **Every number on the landing page is measured**, taken from the benchmark
  results in the Sukrim repo. Nothing there is illustrative, and nothing should be
  replaced with a rounder figure.
- Numbers, units, file paths and finding codes are set in monospace throughout.
  That is deliberate: it is how the page distinguishes a figure that was
  measured from a sentence that was written.
- Light and dark are both first-class; the toggle persists to `localStorage`
  and falls back to `prefers-color-scheme`.
- Animation honours `prefers-reduced-motion` by rendering still rather than by
  running something shorter.
- If the router is unreachable the console says so and asks you to pick an
  agent. It does not fall back to guessing from keywords — a heuristic wearing
  a router's name is the failure mode the whole project is built against.
