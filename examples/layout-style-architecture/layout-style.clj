;; layout-style.clj — Marlinspike layout and style architecture as a dataflow graph
;;
;; Layout algorithms compute node positions. Themes resolve visual appearance.
;; Edge routing is a theme responsibility, not a layout one. The canvas
;; orchestrates both systems via a tick loop with size feedback.
;;
;; Features used that are NOT yet implemented:
;;   - topology schemas (spike.topology.pipeline for tick loop)
;;   - port schema types (discriminated union for algorithm families)
;;   - implementation alternatives (6 layout algorithms, 5 themes)

;; --- Shared layout utilities ---
;; Pure functions used by multiple algorithms. No graph semantics of their own.

(defn topo-grid
  {:ports {:positions positions :layers layers}}
  [^graph nodes ^graph edges]
  (let [sorted     (kahn-topo-sort nodes edges)
        layers     (longest-path-layering sorted edges)
        reordered  (minimize-crossings layers edges)
        positions  (assign-grid-positions reordered)]
    {:positions positions :layers reordered}))

(defn sdf-force
  {:ports {:nodes nodes}}
  [^nodes nodes ^edges edges ^config physics]
  (let [repulsion  (sdf-repulsion nodes physics)
        springs    (hooke-springs nodes edges physics)
        components (component-cohesion nodes edges physics)
        integrated (velocity-integration repulsion springs components physics)]
    {:nodes integrated}))

;; --- Layout algorithms ---
;; Each takes a graph (nodes + edges) and produces positioned nodes.
;; Two families: deterministic (recompute every tick) and force-based (iterative).

;; Deterministic: layers top-to-bottom, nodes centered within layers.
(defn topogrid-layout
  [^graph nodes ^graph edges ^config spacing]
  (let [{:keys [positions]} (topo-grid nodes edges)]
    (apply-spacing positions spacing)))

;; Deterministic: same algorithm rotated 90 degrees, layers become columns.
(defn topoltr-layout
  [^graph nodes ^graph edges ^config spacing]
  (let [{:keys [positions]} (topo-grid nodes edges)]
    (apply-spacing-ltr positions spacing)))

;; Force-based: signed-distance-field repulsion respects node shapes.
;; Seeds from topo-grid to avoid local minima.
(defn sdf-layout
  [^graph nodes ^graph edges ^config physics]
  (let [seed    (topo-grid nodes edges)
        settled (sdf-force seed edges physics)]
    settled))

;; Force-based: extends SDF with directional flow field.
;; Sources push left, sinks push right via topological charge.
(defn field-layout
  [^graph nodes ^graph edges ^config physics]
  (let [seed    (topo-grid nodes edges)
        charges (topo-charge nodes edges)
        after   (sdf-force seed edges physics)
        flowed  (apply-field-force after charges physics)]
    flowed))

;; Force-based: TOPOLTR init + SDF physics + field forces + port pinning.
(defn port-layout
  [^graph nodes ^graph edges ^config physics]
  (let [seed    (topoltr-layout nodes edges physics)
        pinned  (pin-port-nodes seed edges)
        after   (sdf-force pinned edges physics)
        flowed  (apply-field-force after (topo-charge nodes edges) physics)]
    flowed))

;; --- Theme system ---
;; Pure functions: node state → visual properties.
;; Edge routing is a theme responsibility, not layout.

(defn angular-router
  [^point src ^point dst ^angles allowed ^obstacles boxes]
  (let [segments (decompose-angle src dst allowed)
        detoured (avoid-obstacles segments boxes)
        offset   (avoid-colinear detoured)]
    offset))

(defn resolve-theme
  {:ports {:node-style node-style :edge-style edge-style :edge-router edge-router}}
  [^theme-id id]
  (let [node-style  (resolve-node-style id)
        edge-style  (resolve-edge-style id)
        geometry    (resolve-geometry id)
        edge-router (select-router id)]
    {:node-style node-style :edge-style edge-style :edge-router edge-router}))

;; --- Canvas orchestration ---
;; The integration point: layout computes positions, theme resolves appearance.
;; Size feedback loop: child bbox → parent dimensions → parent re-layout.

(defn step-layout
  {:ports {:levels levels :settled settled}}
  [^levels prev ^graph edges ^algorithm algo ^theme theme]
  (let [ticked    (tick-all-levels prev edges algo)
        centered  (center-nodes ticked)
        repinned  (pin-port-nodes centered)
        bbox      (bounding-box centered)
        settled   (check-settled ticked)]
    {:levels repinned :settled settled}))

(defn render-frame
  [^levels layout ^graph edges ^theme theme]
  (let [node-styles (resolve-all-nodes layout theme)
        edge-paths  (route-all-edges edges layout theme)
        drawn       (draw-canvas node-styles edge-paths)]
    drawn))

;; --- Top-level composition ---
;; Layout controls positions. Themes control appearance. Canvas orchestrates.

(def canvas
  [topo-grid
   sdf-force
   topogrid-layout
   topoltr-layout
   sdf-layout
   field-layout
   port-layout
   angular-router
   resolve-theme
   step-layout
   render-frame])
