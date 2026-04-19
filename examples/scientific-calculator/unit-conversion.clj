;; unit-conversion.clj — Composable unit conversion chains
;;
;; Simple leaf nodes (multiply by a constant) compose into reusable
;; conversion subgraphs. Each converter is a callable node with typed
;; input/output ports — wire them together to build conversion chains.

;; --- Leaf converters ---

(defn celsius-to-fahrenheit [^float c]
  (add (multiply c 1.8) 32.0))

(defn fahrenheit-to-celsius [^float f]
  (multiply (subtract f 32.0) 0.5556))

(defn meters-to-feet [^float m]
  (multiply m 3.2808))

(defn feet-to-meters [^float ft]
  (multiply ft 0.3048))

(defn kg-to-lbs [^float kg]
  (multiply kg 2.2046))

(defn lbs-to-kg [^float lbs]
  (multiply lbs 0.4536))

;; --- Composite converter ---
;; Combines multiple conversions into a single node with multiple
;; output ports. Input a measurement in metric; get imperial equivalents.

(defn metric-to-imperial
  {:ports {:temp-f float :dist-ft float :mass-lbs float}}
  [^float temp-c ^float dist-m ^float mass-kg]
  (let [f   (celsius-to-fahrenheit temp-c)
        ft  (meters-to-feet dist-m)
        lbs (kg-to-lbs mass-kg)]
    {:temp-f f :dist-ft ft :mass-lbs lbs}))
