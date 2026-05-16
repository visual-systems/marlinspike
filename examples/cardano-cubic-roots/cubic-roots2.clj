; Step 1 — normalise coefficients by dividing through by a
(defn normalise [a b c d]
  {:b (divide b a)
   :c (divide c a)
   :d (divide d a)})

; Step 2 — depress the cubic: eliminate the x² term
; substituting x = t - b/3 gives t³ + pt + q = 0
(defn depressed-coefficients [{:keys [b c d]}]
  (let [b-sq (square b)
        b-cu (multiply b-sq b)
        p    (subtract c (divide b-sq 3))
        q    (add (subtract d (divide (multiply b c) 3))
                  (divide (multiply 2 b-cu) 27))]
    {:p p :q q}))

; Step 3 — Cardano's u and v terms: ∛(-q/2 ± √(q²/4 + p³/27))
(defn cardano-terms [{:keys [p q]}]
  (let [inner      (add (divide (square q) 4)
                         (divide (multiply p (square p)) 27))
        sqrt-inner (sqrt inner)
        neg-q-half (divide (negate q) 2)]
    {:u (cbrt (add      neg-q-half sqrt-inner))
     :v (cbrt (subtract neg-q-half sqrt-inner))}))

; Step 4 — recover x roots from depressed-cubic roots t,
; back-substituting the shift x = t - b/3
(defn back-substitute [{:keys [u v]} b-norm]
  (let [shift    (divide b-norm 3)
        uv       (add u v)
        uv-half  (divide uv 2)]
    {:x1 (subtract uv          shift)
     :x2 (subtract (negate uv-half) shift)
     :x3 (subtract (negate uv-half) shift)}))

; Top-level entry point — threads the four steps in sequence
(defn cubic-roots
  {:ports {:x1 float :x2 float :x3 float}}
  [^float a ^float b ^float c ^float d]
  (let [norm  (normalise a b c d)
        dep   (depressed-coefficients norm)
        terms (cardano-terms dep)]
    (back-substitute terms (:b norm))))