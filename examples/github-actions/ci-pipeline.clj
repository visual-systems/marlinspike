;; ci-pipeline.clj — A CI/CD pipeline as a Marlinspike graph
;;
;; This example envisions GitHub Actions workflows designed as dataflow graphs.
;; Actions are callable nodes with typed ports. Published actions are
;; URI-referenced subgraphs. The graph can target a YAML runtime to emit
;; a valid .github/workflows/ file.
;;
;; Features used that are NOT yet implemented:
;;   - topology schemas (spike.topology.pipeline)
;;   - URI-referenced subgraphs (spike://github/actions/...)
;;   - runtime targets (spike.target.github-actions-yaml)
;;   - implementation alternatives (production vs simulation)

;; --- Action library references ---
;; These would resolve to published action definitions with typed port interfaces.

(def actions
  [^{:subgraph "spike://github/actions/checkout@v4"}        checkout
   ^{:subgraph "spike://github/actions/setup-node@v4"}      setup-node
   ^{:subgraph "spike://github/actions/cache@v4"}           cache
   ^{:subgraph "spike://github/actions/upload-artifact@v4"} upload-artifact])

;; --- CI pipeline ---
;; A pipeline topology: linear flow with a fan-out at the test stage.

(defn ci-pipeline
  {:ports {:test-results test-report
           :deploy-url   string}}
  [^{:type push-event} trigger]
  (let [repo       (checkout trigger)
        node-env   (setup-node repo {:node-version "20"})
        deps       (cache node-env {:path "node_modules" :key "deps-${{ hashFiles('package-lock.json') }}"})
        build-out  (build deps)
        lint-out   (lint deps)
        test-out   (test build-out)]
    {:test-results (upload-artifact test-out {:name "test-results"})
     :deploy-url   (deploy build-out test-out {:environment "production"})}))

;; --- Build step (composite action) ---
;; A composite action is a callable node whose body is a subgraph.

(defn build
  [^{:type node-environment} env]
  (let [installed (npm-install env)
        compiled  (npm-run-build installed)]
    compiled))

;; --- Deploy step with implementation alternatives ---
;; Production: pushes to real infrastructure.
;; Simulation: logs what would happen, returns a fake URL.
;;
;; Both share the same port interface — selecting "simulation" exercises
;; the same topology without side effects.

(defn deploy
  {:ports {:url string}
   ;; Implementation alternatives (not yet supported in parser):
   ;; :implementations
   ;;   {:production  {:subgraph "spike://myorg/deploy/production"}
   ;;    :simulation  {:subgraph "spike://myorg/deploy/dry-run"}}
   }
  [^{:type build-artifact} artifact
   ^{:type test-report}    tests
   ^{:type deploy-config}  config]
  (let [validated (validate-tests tests)
        pushed    (push-to-registry artifact)
        deployed  (apply-deployment pushed config)]
    {:url (get-deploy-url deployed)}))
