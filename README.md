# Jev demos

Shared browser demos for Jev-compatible decision APIs: text 2048, vision 2048, and bookmark classification. LogJev (Node.js) and LogJev-py include this repository as their `demos/` Git submodule.

## Run

Node.js 22 or later, no dependencies or build step:

```sh
npm start
```

Open http://127.0.0.1:8099. Start a bridge separately. The default endpoint is `http://127.0.0.1:8012`; set `JEV_ENDPOINT` when starting the demo server, or change the endpoint in each model's settings. `PORT` changes the demo server port.

When served by a backend, a `<meta name="jev-endpoint" content="http://...">` in the HTML supplies that backend's default endpoint. A user's saved endpoint takes precedence. Plain static hosting works without the meta tag. Provider API keys belong on the bridge, never in this repository or browser storage.

Required API: `GET /health`, `GET /v1/providers`, `POST /v1/systemone`. `choice` decisions return a selected choice and a probability distribution. Model comparison keeps independent provider/model/endpoint configurations; Compare sits beside the page title.

Move interval defaults to **As fast as possible**. Image input and Request / response start expanded. Only legal 2048 moves are sent to the model. The vision canvas is the actual model input; avoid cosmetic changes to its pixels without re-evaluating behavior.

## Submodule workflow

In a backend repository:

```sh
git submodule update --init --recursive
# After committing a shared demo change:
git -C demos fetch origin
git -C demos checkout --detach origin/main
git add demos
git commit -m "Update shared Jev demos"
```

Both backends use `url = ../jev-demos`. Keep all three repositories under the same GitHub owner (or side by side locally). The backend pins a specific demo commit; updating one backend does not silently update the other. Commit demo changes in this repository first, then advance each backend's submodule pointer.

The Cobalt Grid visual assets and bundled fonts retain their licenses in `assets/cobalt-grid/`. Existing `openjev.*` browser storage keys are preserved for compatibility with earlier demos.
