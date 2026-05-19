;; sdf-algebra.clj — SDF primitives and constructive combinators
;;
;; This defines the reusable SDF algebra as composite nodes. Each primitive
;; takes geometric parameters and produces an SDF (a function from position
;; to signed distance). Combinators compose SDFs using min/max/smooth-min.
;;
;; Port types:
;;   sdf    — a signed distance function (R^2 -> R)
;;   float  — a scalar parameter (radius, width, blend factor)
;;   vec2   — a 2D position vector
;;
;; Convention: SDF is negative inside, zero on surface, positive outside.

;; ---------------------------------------------------------------------------
;; Primitives — leaf nodes that produce SDFs from parameters
;; ---------------------------------------------------------------------------

;; Circle: distance to boundary of a circle at origin with given radius.
;; sdf(p) = length(p) - radius
(defn sdf-circle
  {:ports {:sdf sdf}
   :meta  {:category :primitive
           :glsl "length(p) - radius"
           :gradient "(p / length(p))"
           :jacobian {:radius -1.0}}}
  [^float radius]
  {:sdf (fn [^vec2 p] (subtract (length p) radius))})

;; Axis-aligned box: distance to boundary of a box centered at origin.
;; sdf(p) = length(max(abs(p) - half-size, 0)) + min(max(qx, qy), 0)
(defn sdf-box
  {:ports {:sdf sdf}
   :meta  {:category :primitive
           :glsl "let q = abs(p) - vec2(half_w, half_h); length(max(q, 0.0)) + min(max(q.x, q.y), 0.0)"}}
  [^float half-w ^float half-h]
  {:sdf (fn [^vec2 p]
          (let [q (subtract (abs-vec p) (vec2 half-w half-h))]
            (add (length (max-vec q (vec2 0.0 0.0)))
                 (min (max (vec-x q) (vec-y q)) 0.0))))})

;; Half-plane: everything below y = offset. Useful for clipping.
;; sdf(p) = p.y - offset
(defn sdf-half-plane
  {:ports {:sdf sdf}
   :meta  {:category :primitive
           :glsl "p.y - offset"
           :jacobian {:offset -1.0}}}
  [^float offset]
  {:sdf (fn [^vec2 p] (subtract (vec-y p) offset))})

;; Rounded: offset an existing SDF inward then expand, producing rounding.
;; sdf(p) = inner(p) - radius
(defn sdf-round
  {:ports {:sdf sdf}
   :meta  {:category :modifier
           :glsl "inner - radius"
           :jacobian {:radius -1.0}}}
  [^sdf inner ^float radius]
  {:sdf (fn [^vec2 p] (subtract (inner p) radius))})

;; ---------------------------------------------------------------------------
;; Combinators — interior nodes that compose SDFs
;; ---------------------------------------------------------------------------

;; Union: the region covered by either shape. min(a, b).
(defn sdf-union
  {:ports {:sdf sdf}
   :meta  {:category :combinator
           :glsl "min(a, b)"
           :gradient "a < b ? grad_a : grad_b"}}
  [^sdf a ^sdf b]
  {:sdf (fn [^vec2 p] (min (a p) (b p)))})

;; Intersection: the region covered by both shapes. max(a, b).
(defn sdf-intersection
  {:ports {:sdf sdf}
   :meta  {:category :combinator
           :glsl "max(a, b)"
           :gradient "a > b ? grad_a : grad_b"}}
  [^sdf a ^sdf b]
  {:sdf (fn [^vec2 p] (max (a p) (b p)))})

;; Subtraction: region of a not covered by b. max(a, -b).
(defn sdf-subtract
  {:ports {:sdf sdf}
   :meta  {:category :combinator
           :glsl "max(a, -b)"
           :gradient "a > -b ? grad_a : -grad_b"}}
  [^sdf a ^sdf b]
  {:sdf (fn [^vec2 p] (max (a p) (negate (b p))))})

;; Smooth union: blend two shapes with a smooth minimum.
;; Uses the polynomial smooth-min (Inigo Quilez):
;;   h = clamp(0.5 + 0.5*(b-a)/k, 0, 1)
;;   result = mix(b, a, h) - k*h*(1-h)
;;
;; The blend radius k is a control parameter with a well-defined Jacobian:
;;   d(result)/dk = -h*(1-h)
;; This makes k a natural optimisation target for shape fitting.
(defn sdf-smooth-union
  {:ports {:sdf sdf}
   :meta  {:category :combinator
           :glsl "let h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0); mix(b, a, h) - k*h*(1.0-h)"
           :jacobian {:k "(fn [h] (negate (multiply h (subtract 1.0 h))))"}}}
  [^sdf a ^sdf b ^float k]
  {:sdf (fn [^vec2 p]
          (let [va (a p)
                vb (b p)
                h  (clamp (add 0.5 (divide (multiply 0.5 (subtract vb va)) k)) 0.0 1.0)]
            (subtract (mix vb va h)
                      (multiply k (multiply h (subtract 1.0 h))))))})

;; Smooth intersection: dual of smooth union.
(defn sdf-smooth-intersection
  {:ports {:sdf sdf}
   :meta  {:category :combinator
           :glsl "let h = clamp(0.5 - 0.5*(b-a)/k, 0.0, 1.0); mix(b, a, h) + k*h*(1.0-h)"}}
  [^sdf a ^sdf b ^float k]
  {:sdf (fn [^vec2 p]
          (let [va (a p)
                vb (b p)
                h  (clamp (subtract 0.5 (divide (multiply 0.5 (subtract vb va)) k)) 0.0 1.0)]
            (add (mix vb va h)
                 (multiply k (multiply h (subtract 1.0 h))))))})

;; ---------------------------------------------------------------------------
;; Transforms — modify the input position before evaluating an SDF
;; ---------------------------------------------------------------------------

;; Translate: shift the evaluation point.
(defn sdf-translate
  {:ports {:sdf sdf}
   :meta  {:category :transform
           :glsl "inner(p - offset)"
           :jacobian {:offset "negate(gradient)"}}}
  [^sdf inner ^vec2 offset]
  {:sdf (fn [^vec2 p] (inner (subtract-vec p offset)))})

;; Rotate: rotate the evaluation point around the origin.
(defn sdf-rotate
  {:ports {:sdf sdf}
   :meta  {:category :transform
           :glsl "let c = cos(angle); let s = sin(angle); inner(vec2(c*p.x+s*p.y, -s*p.x+c*p.y))"}}
  [^sdf inner ^float angle]
  {:sdf (fn [^vec2 p]
          (let [c (cos angle)
                s (sin angle)]
            (inner (vec2 (add (multiply c (vec-x p)) (multiply s (vec-y p)))
                         (add (negate (multiply s (vec-x p))) (multiply c (vec-y p)))))))})

;; Symmetry: mirror across the Y axis (exploit bilateral symmetry).
(defn sdf-mirror-x
  {:ports {:sdf sdf}
   :meta  {:category :transform
           :glsl "inner(vec2(abs(p.x), p.y))"}}
  [^sdf inner]
  {:sdf (fn [^vec2 p] (inner (vec2 (abs (vec-x p)) (vec-y p))))})
