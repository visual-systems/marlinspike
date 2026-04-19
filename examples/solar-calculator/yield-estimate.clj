;; yield-estimate.clj — Solar panel yield prediction as a dataflow graph
;;
;; Input roof geometry, panel specs, and geographic data; compute
;; predicted annual energy yield. Every intermediate value (irradiance,
;; temperature-adjusted efficiency, shading factor) is a visible node.
;;
;; Features used that are NOT yet implemented:
;;   - topology schemas (spike.topology.pipeline)
;;   - runtime targets (spike.target.simulation)
;;   - implementation alternatives (clear-sky vs satellite irradiance)

;; --- Geographic inputs ---

(defn sun-position
  {:ports {:azimuth float :elevation float :day-length float}}
  [^float latitude ^float longitude ^int day-of-year]
  (let [declination (solar-declination day-of-year)
        hour-angle  (solar-hour-angle longitude day-of-year)
        elev        (calc-elevation latitude declination hour-angle)
        azim        (calc-azimuth latitude declination hour-angle elev)
        day-len     (calc-day-length latitude declination)]
    {:azimuth azim :elevation elev :day-length day-len}))

;; --- Irradiance model ---
;; Two alternative implementations: clear-sky (analytical) and
;; satellite-derived (historical data lookup). Same port interface.

(defn irradiance
  {:ports {:ghi float :dni float :dhi float}
   ;; :implementations
   ;;   {:clear-sky  {:subgraph "spike://solar/models/clear-sky-irradiance"}
   ;;    :satellite  {:subgraph "spike://solar/models/satellite-irradiance"}}
   }
  [^float elevation ^float day-length ^float cloud-cover]
  (let [extraterrestrial (solar-constant elevation)
        clearness        (clearness-index cloud-cover)
        ghi              (multiply extraterrestrial clearness)
        dni              (direct-normal ghi elevation)
        dhi              (subtract ghi (multiply dni (sin-deg elevation)))]
    {:ghi ghi :dni dni :dhi dhi}))

;; --- Panel physics ---

(defn panel-output
  {:ports {:power-w float :efficiency float}}
  [^float dni ^float dhi
   ^float panel-area ^float panel-efficiency
   ^float tilt ^float azimuth-offset
   ^float ambient-temp]
  (let [;; Effective irradiance on tilted surface
        poa-direct   (multiply dni (cos-incidence-angle tilt azimuth-offset))
        poa-diffuse  (multiply dhi (isotropic-sky-factor tilt))
        poa-total    (add poa-direct poa-diffuse)

        ;; Temperature derating
        cell-temp    (add ambient-temp (multiply poa-total 0.03))
        temp-coeff   (multiply (subtract cell-temp 25.0) -0.004)
        eff-adjusted (multiply panel-efficiency (add 1.0 temp-coeff))

        ;; Output
        power        (multiply poa-total (multiply panel-area eff-adjusted))]
    {:power-w power :efficiency eff-adjusted}))

;; --- Shading ---

(defn shading-factor
  [^float sun-elevation ^float sun-azimuth
   ^float obstruction-height ^float obstruction-distance ^float obstruction-azimuth]
  (let [shadow-angle  (atan2 obstruction-height obstruction-distance)
        azimuth-delta (abs (subtract sun-azimuth obstruction-azimuth))
        in-shadow     (boolean-and (lt sun-elevation shadow-angle)
                                   (lt azimuth-delta 15.0))]
    (if-factor in-shadow 0.0 1.0)))

;; --- Annual yield ---
;; Top-level composition: geographic data + roof + panels → annual kWh.

(defn annual-yield
  {:ports {:kwh-year float :avg-efficiency float}}
  [^float latitude ^float longitude
   ^float roof-tilt ^float roof-azimuth
   ^float panel-area ^float panel-efficiency
   ^float avg-cloud-cover ^float avg-temp]
  (let [{:keys [elevation day-length]}
          (sun-position latitude longitude 172)  ; summer solstice representative

        {:keys [dni dhi]}
          (irradiance elevation day-length avg-cloud-cover)

        {:keys [power-w efficiency]}
          (panel-output dni dhi
                        panel-area panel-efficiency
                        roof-tilt roof-azimuth
                        avg-temp)

        ;; Scale daily power to annual estimate
        daily-kwh  (multiply (multiply power-w day-length) 0.001)
        annual-kwh (multiply daily-kwh 365.0)]
    {:kwh-year annual-kwh :avg-efficiency efficiency}))
