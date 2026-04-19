;; microservices.clj — A microservice architecture as a Marlinspike graph
;;
;; Services are composite nodes with typed ports (HTTP, gRPC, message queue).
;; Inter-service communication is explicit edges. The graph can target a
;; Kubernetes runtime to emit deployment manifests.
;;
;; Features used that are NOT yet implemented:
;;   - topology schemas (spike.topology.actor for message queues)
;;   - port schema types (io.http, io.grpc, io.amqp)
;;   - runtime targets (spike.target.k8s)
;;   - implementation alternatives (production, docker-compose, mock)
;;   - constraint plugins (health check required, DLQ required)

;; --- Shared infrastructure ---

(def infrastructure
  [^{:subgraph "spike://k8s/postgres@15"}     postgres
   ^{:subgraph "spike://k8s/rabbitmq@3.12"}   rabbitmq
   ^{:subgraph "spike://k8s/redis@7"}         redis])

;; --- Auth service ---
;; Exposes an HTTP API for token validation. Backed by Redis for session
;; cache and Postgres for user credentials.

(defn auth-service
  {:ports {:http    io-http-response
           :health io-health-status}
   ;; :activeSchemas ["io.k8s.deployment"]
   ;; :implementations
   ;;   {:production {:subgraph "spike://myorg/services/auth@v2.1"}
   ;;    :mock       {:subgraph "spike://myorg/services/auth-mock"}}
   }
  [^io-http-request request
   ^io-redis-conn   session-cache
   ^io-pg-conn      credentials-db]
  (let [session  (cache-lookup session-cache request)
        user     (verify-credentials credentials-db request)
        token    (issue-token user)
        cached   (cache-store session-cache token)]
    {:http    (http-ok token)
     :health  (health-check credentials-db session-cache)}))

;; --- User service ---
;; CRUD operations on user profiles. Publishes events to a message queue
;; when profiles change.

(defn user-service
  {:ports {:http    io-http-response
           :events io-amqp-message
           :health io-health-status}}
  [^io-http-request  request
   ^io-pg-conn       user-db
   ^io-amqp-channel  event-bus]
  (let [user     (handle-user-request user-db request)
        event    (emit-user-event event-bus user)
        health   (health-check user-db)]
    {:http    (http-ok user)
     :events  event
     :health  health}))

;; --- Notification service ---
;; Consumes user events from the message queue. Sends emails, push
;; notifications, etc. No HTTP API — purely event-driven.

(defn notification-service
  {:ports {:health io-health-status}
   ;; An actor topology: consumes messages, produces side effects.
   ;; :activeSchemas ["spike.topology.actor"]
   }
  [^io-amqp-message  user-event
   ^io-smtp-conn     email-client]
  (let [parsed   (parse-event user-event)
        template (select-template parsed)
        sent     (send-notification email-client template parsed)]
    {:health (health-check email-client)}))

;; --- API gateway ---
;; Routes external requests to internal services. Validates auth tokens
;; before forwarding.

(defn api-gateway
  {:ports {:http io-http-response}
   ;; :activeSchemas ["spike.topology.pipeline"]
   }
  [^io-http-request external-request]
  (let [token     (extract-token external-request)
        auth-resp (auth-service token redis postgres)
        validated (validate-auth auth-resp)
        routed    (route-request validated
                    {"/users"   user-service
                     "/auth"    auth-service})]
    {:http routed}))

;; --- Cluster composition ---
;; The top-level graph wires services together with their infrastructure
;; dependencies. This is what the canvas shows at the highest zoom level.

(def cluster
  [infrastructure
   auth-service
   user-service
   notification-service
   api-gateway])
