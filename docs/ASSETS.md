# Assets and Licenses

## ASTERGRID artwork

- Source: `Astergrid.jpeg` (3840×2160), supplied by the project owner.
- The original is preserved unchanged.
- Generated derivatives:
  - `frontend/public/brand/astergrid-hero.jpg` — full-bleed launch hero
  - `frontend/public/brand/astergrid-mark.png` — circular radar crop
  - `frontend/public/brand/astergrid-mark-64.png` — compact mark
  - `frontend/public/brand/favicon-32.png` — favicon source
  - `frontend/public/favicon.ico` — multi-size favicon
- Generator: `scripts/prepare_brand.py`.
- The artwork is **not** relicensed by the MIT license covering the source code. It remains the property of the project owner.
- The artwork is used in the launch hero and as the compact radar mark. It is not presented as real geography or real operational imagery.

## Fonts

Bundled through `@fontsource` packages under the SIL Open Font License:

- Space Grotesk (`@fontsource/space-grotesk`)
- Inter (`@fontsource/inter`)
- IBM Plex Mono (`@fontsource/ibm-plex-mono`)

## Icons

- Lucide icons (`lucide-react`), ISC license.

## Frontend libraries

- React and React DOM — MIT
- three.js — MIT
- `@react-three/fiber` — MIT
- `@react-three/drei` — MIT
- Zustand — MIT
- Zod — MIT
- Vite — MIT
- TypeScript — Apache-2.0
- Vitest — MIT
- `@playwright/test` — Apache-2.0
- `@testing-library/react` and `@testing-library/jest-dom` — MIT

No postprocessing package is installed. The visual presets use native Three.js materials and shaders.

## Backend libraries

- FastAPI, Starlette, Uvicorn — MIT / BSD-3-Clause as declared by each package
- Pydantic and pydantic-settings — MIT
- Google ADK — Apache-2.0
- NumPy — BSD-3-Clause
- NetworkX — BSD-3-Clause
- aiosqlite — MIT
- pytest, pytest-asyncio, httpx, Ruff — MIT / Apache-2.0 as declared by each package

See package metadata and lockfiles for exact license terms and transitive dependencies.

## Generated content

All terrain, scenario names, districts, facilities, populations, routes, and events are fictional and generated locally. No third-party map data, real geospatial dataset, live feed, or named-person data is included.

## Evidence imagery

Screenshots under `docs/evidence/` were captured from the running production build. They contain synthetic data and no credentials. Provenance, hashes, and the capture command are recorded in [`docs/evidence/README.md`](evidence/README.md).

## Repository note

Third-party license texts are preserved by their packages. A production release should include a generated third-party notices file if distribution requirements demand it.