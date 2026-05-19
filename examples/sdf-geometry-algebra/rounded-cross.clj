;; rounded-cross.clj — A rounded cross shape built from the SDF algebra
;;
;; Demonstrates composing primitive SDFs via smooth union to create a
;; non-trivial shape. The graph has a natural tree structure:
;;
;;        smooth-union (k=0.3)
;;           /            \
;;    horizontal-bar    vertical-bar
;;     (box 1.0 0.3)    (box 0.3 1.0)
;;
;; This is the simplest interesting example: two primitives, one combinator,
;; one control parameter (the blend radius k).

(defn rounded-cross
  {:ports {:sdf sdf}
   :meta  {:description "A rounded cross: two boxes joined with smooth union"
           :parameters {:bar-width  {:type float :default 0.3 :range [0.05 0.8]}
                        :bar-length {:type float :default 1.0 :range [0.2 2.0]}
                        :blend      {:type float :default 0.3 :range [0.01 1.0]}}}}
  [^float bar-width ^float bar-length ^float blend]
  (let [horizontal (sdf-box bar-length bar-width)
        vertical   (sdf-box bar-width bar-length)]
    {:sdf (sdf-smooth-union horizontal vertical blend)}))

;; ---------------------------------------------------------------------------
;; A more complex variant: rounded cross with a circular cutout
;; ---------------------------------------------------------------------------
;;
;; Adds a subtraction operation to cut a hole in the center, demonstrating
;; the full boolean algebra: union, then subtraction.
;;
;;        subtract
;;        /      \
;;   smooth-union  circle (r=0.15)
;;      /    \
;;   h-bar  v-bar

(defn cross-with-hole
  {:ports {:sdf sdf}
   :meta  {:description "Rounded cross with circular cutout at center"}}
  [^float bar-width ^float bar-length ^float blend ^float hole-radius]
  (let [horizontal (sdf-box bar-length bar-width)
        vertical   (sdf-box bar-width bar-length)
        cross      (sdf-smooth-union horizontal vertical blend)
        hole       (sdf-circle hole-radius)]
    {:sdf (sdf-subtract cross hole)}))

;; ---------------------------------------------------------------------------
;; Parametric ring of crosses — demonstrating spatial composition
;; ---------------------------------------------------------------------------
;;
;; Places N copies of rounded-cross around a circle, using translate and
;; rotate transforms with union. This is an example of programmatic graph
;; construction — the graph topology depends on the parameter N.
;;
;; For N=4:
;;
;;            union
;;         /   |   \  \
;;   translate translate translate translate
;;     |         |         |         |
;;   rotate    rotate    rotate    rotate
;;     |         |         |         |
;;   cross    cross    cross    cross
;;
;; Each cross is independently parameterised: the graph has 4*3 = 12
;; control parameters (bar-width, bar-length, blend per copy) plus the
;; ring radius. The Jacobian has 13 columns.

;; NOTE: This uses a hypothetical `reduce-union` combinator that takes
;; a list of SDFs. In the current algebra this would be a chain of
;; binary unions. The graph structure is the same either way — a
;; balanced tree of binary unions, or a left fold.

(defn cross-ring
  {:ports {:sdf sdf}
   :meta  {:description "Ring of rounded crosses"
           :parameters {:n      {:type int :default 4}
                        :radius {:type float :default 2.0}
                        :bar-w  {:type float :default 0.15}
                        :bar-l  {:type float :default 0.5}
                        :blend  {:type float :default 0.2}}}}
  [^int n ^float radius ^float bar-w ^float bar-l ^float blend]
  ;; Generate N crosses placed around a circle of given radius.
  ;; Each is rotated to face outward from the center.
  (let [angle-step (divide (* 2.0 pi) (float n))
        crosses    (map-indexed
                     (fn [i _]
                       (let [angle (multiply (float i) angle-step)
                             base  (rounded-cross bar-w bar-l blend)]
                         (sdf-translate (sdf-rotate base angle)
                                        (vec2 (multiply radius (cos angle))
                                              (multiply radius (sin angle))))))
                     (range n))]
    {:sdf (reduce sdf-union crosses)}))
