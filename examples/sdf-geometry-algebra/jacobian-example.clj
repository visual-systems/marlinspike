;; jacobian-example.clj — Automatic differentiation over the SDF graph
;;
;; The SDF algebra graph is a computation DAG. Every primitive has a known
;; analytic derivative (stored in :jacobian metadata). Every combinator has
;; a known chain rule. Walking the graph in reverse (reverse-mode AD) yields
;; the Jacobian of the composite SDF with respect to all control parameters.
;;
;; This file sketches how Jacobian computation works over the rounded-cross
;; graph, and what it enables.
;;
;; NOTE: This is aspirational — the AD traversal is not yet implemented.
;; The graph structure enables it; this file documents the intended semantics.

;; ---------------------------------------------------------------------------
;; The computation graph for rounded-cross
;; ---------------------------------------------------------------------------
;;
;; Forward pass (evaluating the SDF at a point p):
;;
;;   bar-width ──→ sdf-box(h) ──→ smooth-union ──→ result
;;   bar-length ─┘                    ↑
;;   bar-width ──→ sdf-box(v) ────────┘
;;   bar-length ─┘      ↑
;;   blend ──────────────┘ (smooth-union k parameter)
;;
;; Reverse pass (Jacobian via chain rule):
;;
;;   d(result)/d(bar-width)  = d(smooth-union)/d(h) * d(h)/d(bar-width)
;;                           + d(smooth-union)/d(v) * d(v)/d(bar-width)
;;
;;   d(result)/d(bar-length) = d(smooth-union)/d(h) * d(h)/d(bar-length)
;;                           + d(smooth-union)/d(v) * d(v)/d(bar-length)
;;
;;   d(result)/d(blend)      = d(smooth-union)/d(k)  = -h*(1-h)
;;
;; The chain rule follows the graph edges. Fan-out (bar-width feeds both
;; boxes) produces a sum. This is exactly reverse-mode automatic
;; differentiation over the graph structure.

;; ---------------------------------------------------------------------------
;; Jacobian-aware rounded cross
;; ---------------------------------------------------------------------------
;;
;; This version of rounded-cross exposes both the SDF and its Jacobian.
;; The Jacobian is a vector of partial derivatives, one per control parameter.

(defn rounded-cross-with-jacobian
  {:ports {:sdf sdf :jacobian jacobian}
   :meta  {:description "Rounded cross with analytic Jacobian"
           :parameters {:bar-width  {:type float :default 0.3}
                        :bar-length {:type float :default 1.0}
                        :blend      {:type float :default 0.3}}
           :outputs    {:sdf "Signed distance at evaluation point"
                        :jacobian "Partial derivatives: [d/d(bar-width), d/d(bar-length), d/d(blend)]"}}}
  [^float bar-width ^float bar-length ^float blend]
  (let [;; Forward pass
        horizontal   (sdf-box bar-length bar-width)
        vertical     (sdf-box bar-width bar-length)
        combined     (sdf-smooth-union horizontal vertical blend)

        ;; Reverse pass — chain rule over the graph
        ;; smooth-union Jacobian w.r.t. its inputs:
        ;;   d/da = h,  d/db = 1-h,  d/dk = -h*(1-h)
        ;; where h = clamp(0.5 + 0.5*(b-a)/k, 0, 1)
        ;;
        ;; box Jacobian w.r.t. its parameters:
        ;;   depends on which face is closest (the gradient direction)
        ;;
        ;; The full Jacobian is computed by walking the graph edges in reverse,
        ;; accumulating via the chain rule. This is structurally identical to
        ;; reverse-mode AD — the graph IS the computation tape.
        jacobian     (reverse-ad combined
                       {:bar-width  bar-width
                        :bar-length bar-length
                        :blend      blend})]
    {:sdf      combined
     :jacobian jacobian}))

;; ---------------------------------------------------------------------------
;; Use case: shape fitting via gradient descent
;; ---------------------------------------------------------------------------
;;
;; Given a target boundary (a set of 2D points that should be on the surface),
;; find parameters that minimise the sum of squared SDF values at those points.
;;
;; Loss = sum_i (sdf(p_i; params))^2
;; d(Loss)/d(params) = 2 * sum_i sdf(p_i; params) * jacobian(p_i; params)
;;
;; The Jacobian from the graph gives us the gradient of the loss analytically.
;; No finite differences, no numeric approximation.

(defn fit-rounded-cross
  {:ports {:params params}
   :meta  {:description "Fit a rounded cross to target boundary points"
           :category :optimisation}}
  [^vec2-list target-points ^params initial-params]
  (let [;; Evaluate loss and gradient at current parameters
        evaluate (fn [params]
                   (let [cross (rounded-cross-with-jacobian
                                 (:bar-width params)
                                 (:bar-length params)
                                 (:blend params))
                         loss  (reduce add 0.0
                                 (map (fn [p]
                                        (let [d ((:sdf cross) p)]
                                          (multiply d d)))
                                      target-points))
                         grad  (reduce vec-add (vec3 0 0 0)
                                 (map (fn [p]
                                        (let [d ((:sdf cross) p)
                                              j ((:jacobian cross) p)]
                                          (scale-vec j (multiply 2.0 d))))
                                      target-points))]
                     {:loss loss :gradient grad}))]
    ;; Gradient descent loop (the graph represents a single step;
    ;; iteration is the execution runtime's responsibility)
    {:params (gradient-step evaluate initial-params)}))

;; ---------------------------------------------------------------------------
;; Use case: GLSL code generation
;; ---------------------------------------------------------------------------
;;
;; The same graph compiles to GLSL by walking forward and emitting shader code
;; for each node. Metadata on each primitive/combinator provides the GLSL
;; template (see :glsl in sdf-algebra.clj).
;;
;; For rounded-cross, the generated shader would be:
;;
;;   float sdf_rounded_cross(vec2 p, float bar_width, float bar_length, float blend) {
;;       float h = sdf_box(p, bar_length, bar_width);
;;       float v = sdf_box(p, bar_width, bar_length);
;;       float k = blend;
;;       float t = clamp(0.5 + 0.5*(v-h)/k, 0.0, 1.0);
;;       return mix(v, h, t) - k*t*(1.0-t);
;;   }
;;
;; The Jacobian can also be compiled to GLSL for GPU-accelerated optimisation.
