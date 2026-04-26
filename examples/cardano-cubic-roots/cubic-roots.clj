;; cubic-roots.clj — Cardano's formula for the depressed cubic x^3 + px + q = 0
;;
;; The depressed cubic is the canonical form: any cubic ax^3 + bx^2 + cx + d = 0
;; can be reduced to x^3 + px + q = 0 by substituting x = t - b/(3a).
;;
;; Cardano's formula:
;;   D     = (q/2)^2 + (p/3)^3          — discriminant
;;   u     = cbrt(-q/2 + sqrt(D))        — first cube root
;;   v     = cbrt(-q/2 - sqrt(D))        — second cube root
;;   x1    = u + v                        — first root (always real)
;;   x2    = omega*u + omega^2*v          — second root
;;   x3    = omega^2*u + omega*v          — third root
;;
;; where omega = e^(2*pi*i/3) is the primitive cube root of unity.
;;
;; CASUS IRREDUCIBILIS: When D < 0, all three roots are real, but the formula
;; necessarily passes through complex intermediate values (sqrt of a negative
;; discriminant). The graph makes this visible: the complex-sqrt node outputs
;; a complex value even though its input and the final roots are real.
;;
;; Features used that are NOT yet implemented:
;;   - complex type on ports
;;   - complex-sqrt, cbrt, cube-root-of-unity primitives
;;   - type-changing nodes (float input → complex output)

;; --- Discriminant ---
;; D = (q/2)^2 + (p/3)^3

(defn discriminant
  [^float p ^float q]
  (let [q-half  (divide q 2.0)
        p-third (divide p 3.0)
        term1   (square q-half)
        term2   (cube p-third)]
    (add term1 term2)))

;; --- Cardano's formula ---
;; Returns all three roots. x1 is always real; x2 and x3 are real when D < 0
;; (casus irreducibilis) but computed via complex intermediates.

(defn cubic-roots
  {:ports {:x1 float :x2 complex :x3 complex}}
  [^float p ^float q]
  (let [;; Discriminant
        disc       (discriminant p q)

        ;; Square root of discriminant — TYPE TRANSITION: float → complex
        ;; When disc < 0 (casus irreducibilis), this is purely imaginary.
        sqrt-disc  (complex-sqrt disc)                ; ^complex

        ;; Cardano's substitution
        neg-q-half (negate (divide q 2.0))
        u          (cbrt (complex-add neg-q-half sqrt-disc))      ; ^complex
        v          (cbrt (complex-subtract neg-q-half sqrt-disc)) ; ^complex

        ;; Cube roots of unity
        omega      (cube-root-of-unity)               ; ^complex constant
        omega-sq   (complex-multiply omega omega)     ; ^complex

        ;; First root: x1 = u + v (real part — imaginary parts cancel)
        x1         (real-part (complex-add u v))      ; ^float

        ;; Second root: x2 = omega*u + omega^2*v
        x2         (complex-add (complex-multiply omega u)
                                (complex-multiply omega-sq v))

        ;; Third root: x3 = omega^2*u + omega*v
        x3         (complex-add (complex-multiply omega-sq u)
                                (complex-multiply omega v))]

    {:x1 x1 :x2 x2 :x3 x3}))
