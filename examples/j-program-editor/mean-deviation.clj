;; mean-deviation.clj — Mean absolute deviation as a dataflow graph
;;
;; The tacit J expression:  mean_dev =: +/ % # @ | - +/ % #
;;
;; This computes: mean(|x - mean(x)|)
;;
;; Decomposed into an explicit dataflow graph, each J verb is a node
;; with typed array ports. The graph makes the implicit forks and
;; compositions visible.
;;
;; Features used that are NOT yet implemented:
;;   - array rank/shape types on ports
;;   - J runtime target (evaluation via J interpreter)
;;   - tacit notation in code view

;; --- Primitive verbs ---
;; Each verb is a leaf node. In a full implementation these would
;; reference a J verb library via URI.

(defn sum
  ;; J: +/  (insert-reduce of plus)
  [^{:type "array float rank-1"} xs]
  (reduce-insert add xs))

(defn tally
  ;; J: #  (count of items)
  [^{:type "array float rank-1"} xs]
  (count-items xs))

(defn mean
  ;; J: +/ % #  (sum divided by tally — a fork)
  ;; Fork topology: xs fans out to sum and tally, results merge in divide.
  [^{:type "array float rank-1"} xs]
  (let [s (sum xs)
        n (tally xs)]
    (divide s n)))

(defn subtract-scalar
  ;; J: -  (applied with rank 0 on right)
  ;; Subtracts a scalar from every element of an array.
  [^{:type "array float rank-1"} xs
   ^float scalar]
  (map-subtract xs scalar))

(defn magnitude
  ;; J: |  (absolute value, applied element-wise)
  [^{:type "array float rank-1"} xs]
  (map-abs xs))

;; --- Composition: mean absolute deviation ---
;; J: +/ % # @ | - +/ % #
;;
;; Decomposed:
;;   1. Compute mean of input          (fork: +/ % #)
;;   2. Subtract mean from each element (dyadic -)
;;   3. Take absolute values            (monadic |)
;;   4. Compute mean of result          (fork: +/ % #)
;;
;; The graph topology is:
;;
;;   xs ──┬── mean ──┐
;;         │          ├── subtract-scalar ── magnitude ── mean ── result
;;         └──────────┘

(defn mean-absolute-deviation
  [^{:type "array float rank-1"} xs]
  (let [avg       (mean xs)
        centered  (subtract-scalar xs avg)
        abs-vals  (magnitude centered)
        result    (mean abs-vals)]
    result))
