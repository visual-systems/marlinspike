# Solar Calculator

## Vision

Model solar panel yield predictions as a dataflow graph. Input roof geometry, proposed panel
placement, and geographic data; the graph computes predicted energy yield across time periods.
Every intermediate result — solar irradiance, panel efficiency at temperature, shading losses — is
visible as a node value on the canvas.

## Why this matters

Solar yield calculations involve multiple interacting models (sun position, weather, panel physics,
shading geometry) that are typically buried in spreadsheets or opaque simulation tools. As a
Marlinspike graph:

- **Transparent computation** — the full dependency chain from geographic coordinates to annual kWh
  is visible and navigable. A homeowner or installer can see exactly which factors affect the
  estimate.
- **Composable models** — swap out the irradiance model (clear-sky vs. satellite-derived) by
  selecting an alternative implementation. The rest of the graph stays wired.
- **Sensitivity analysis** — change a single input (roof pitch, panel efficiency, latitude) and
  watch values propagate. Which factor has the biggest impact on yield?
- **Sharable calculations** — a solar installer can share a URI to a configured calculation graph.
  The client sees the same interactive model, not a PDF summary.

## Source files

- [`yield-estimate.clj`](yield-estimate.clj) — end-to-end yield prediction from roof geometry and
  location to annual energy output
