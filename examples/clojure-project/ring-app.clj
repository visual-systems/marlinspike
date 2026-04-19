;; ring-app.clj — A minimal Ring web application as a Marlinspike graph
;;
;; This example envisions a real Clojure project whose structure is
;; fully represented in the graph. Namespaces are composite nodes;
;; functions are callable nodes; require relationships are edges.
;;
;; Features used that are NOT yet implemented:
;;   - namespace-as-composite mapping
;;   - require-as-edge inference
;;   - Clojure runtime target (nREPL evaluation)

;; --- app.handler namespace ---
;; The core request handler. Takes a Ring request map, returns a response.

(defn handle-hello
  {:ports {:response ring-response}}
  [^ring-request request]
  (let [name   (get-param request "name")
        body   (format-greeting name)]
    {:response (ring-ok body)}))

(defn handle-not-found
  {:ports {:response ring-response}}
  [^ring-request request]
  {:response (ring-not-found "Not found")})

;; --- app.routes namespace ---
;; Routes compose handlers into a single dispatcher.

(defn router
  {:ports {:response ring-response}}
  [^ring-request request]
  (let [path    (get-path request)
        handler (match-route path
                  {"/"      handle-hello
                   :default handle-not-found})]
    {:response (handler request)}))

;; --- app.middleware namespace ---
;; Middleware wraps the router, adding cross-cutting concerns.
;; Each middleware is a callable node that takes a handler and returns
;; a wrapped handler — function composition as graph topology.

(defn wrap-logging
  {:ports {:handler ring-handler}}
  [^ring-handler handler]
  (let [logged (fn [request]
                 (let [_      (log-request request)
                       resp   (handler request)
                       _      (log-response resp)]
                   resp))]
    {:handler logged}))

(defn wrap-cors
  {:ports {:handler ring-handler}}
  [^ring-handler handler]
  (let [corsed (fn [request]
                 (let [resp    (handler request)
                       headers (add-cors-headers resp)]
                   headers))]
    {:handler corsed}))

;; --- app.core namespace ---
;; The application entry point. Composes middleware around the router
;; and starts the server.

(defn app
  {:ports {:server jetty-server}}
  [^server-config config]
  (let [routes  (router)
        logged  (wrap-logging routes)
        corsed  (wrap-cors logged)
        server  (start-server corsed config)]
    {:server server}))
