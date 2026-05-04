# Minimap Shell Contract

## Base Shell Classes

- Root panel: `minimap-shell`
- Variant hook: one of
  - `minimap-variant-clinic`
  - `minimap-variant-winddyke`
  - `minimap-variant-industrial`
  - `minimap-variant-gov`
  - `minimap-variant-steelcross`
  - `minimap-variant-transit`
- Head row: `minimap-shell-head`
- Title: `minimap-shell-title`
- Toggle: `minimap-shell-toggle`
- Collapsible: `minimap-shell-collapsible`
- Collapsible inner: `minimap-shell-collapsible-inner`
- Body: `minimap-shell-body`
- Canvas wrapper: `minimap-shell-canvas`

Legacy `clinic-minimap-*` classes are retained only for branch-internal graphic hooks such as `clinic-minimap-badge`, `clinic-minimap`, and clinic-specific SVG styling. Shell structure itself should emit `minimap-shell*` classes only.

## Required Renderer Helpers

- Host creation must include `minimap-shell` and one variant class.
- Transit onboard must use its own host id: `transit-minimap-panel`.
- Head row must use `buildMiniMapHeadRowMarkup(...)`.
- Body shell must use:
  - `buildMiniMapShellBodyOpenMarkup(...)`
  - `buildMiniMapShellBodyCloseMarkup(...)`
- Open/close options must stay symmetric. A branch must not open canvas and close without canvas, or vice versa.
- Final panel commit must use `finalizeMiniMapPanel(...)` so density, collapsed state binding, and atmosphere state stay on one path.

## Density Contract

- Base widths:
  - `compact`: `294px`
  - `standard`: `315px`
  - `expanded`: `337px`
- Variant override is allowed only when the branch cannot read cleanly within the base width.
- Current allowed width override:
  - none

Transit onboard must not bypass density or reuse another branch host semantic. It should render through the shared shell, inside its own `transit-minimap-panel`, and let `finalizeMiniMapPanel(...)` assign density.

## Allowed Variant Overrides

- Clinic:
  - clinic-only internal SVG presentation rules
- Steelcross:
  - port overview may aggregate market family into one `到港集会` node on the port-level map
  - market-internal minimap may show only nodes `1-6`, but the player-facing node labels must use the current canonical stall display names rather than bare numbers
  - Theseus-related map ids must stay outside minimap specs
- Other branches:
  - only branch-specific internal SVG/layout rules
  - no panel/head/title/body redefinition unless a concrete readability constraint requires it

## Steelcross Branch Rules

- Port overview lives in the existing minimap-shell branch system; do not build a second steelcross-specific map UI.
- Port-level minimap may include only top-level steelcross port nodes already present in map routing, such as port / dock / mutual aid / aggregated market access.
- `steelcross_market_01` through `steelcross_market_07` must not be flattened onto the port overview. The port overview must render a single aggregated market node labelled `到港集会`.
- Market-internal minimap visibility must be driven by real steelcross market-family map ids registered in the spec registry.
- The market-internal minimap for this phase shows only `1-6`, and those nodes must display canonical player-facing stall names from the current business text.
- Theseus ship / crew / work / ship-placeholder maps are excluded from minimap specs even though they remain valid runtime maps elsewhere.

## Out Of Scope For Shell Work

- SVG topology
- Node positions
- Floor bands
- Edges / labels / stair connectors
- Branch-specific spec topology

## Adding A New Minimap

1. Create or reuse a host panel with `minimap-shell` and one `minimap-variant-*` class.
2. Render the head row through `buildMiniMapHeadRowMarkup(...)`.
3. Render the content inside the shared body shell helpers.
4. Call `finalizeMiniMapPanel(...)` after `panel.innerHTML = html`.
5. Put branch-specific visual differences under a variant selector, not by forking the shell selectors.