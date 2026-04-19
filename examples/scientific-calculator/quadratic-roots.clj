;; quadratic-roots.clj — Compute both roots of ax^2 + bx + c = 0
;;
;; This is the canonical Marlinspike dataflow example. Each node is a
;; mathematical operation; edges carry typed numeric values. The graph
;; computes both roots using the quadratic formula.
;;
;; This example uses only features that ARE currently implemented in
;; the Spike-Clojure parser.

(defn quadratic-roots
  {:ports {:x1 float :x2 float}}
  [^float a ^float b ^float c]
  (let [neg-b  (negate b)
        disc   (subtract (square b) (multiply 4.0 (multiply a c)))
        sqrt-d (sqrt disc)
        two-a  (multiply 2.0 a)]
    {:x1 (divide (add      neg-b sqrt-d) two-a)
     :x2 (divide (subtract neg-b sqrt-d) two-a)}))
