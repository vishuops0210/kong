# Kong decK YAML — Complete Reference Guide
> Every field, every option, every "why" — for Services, Routes, Plugins, Consumers

---

## The Mental Model — Read This First

```
Normal User (Rahul)
      │
      │  opens your React app / mobile app / Postman
      ▼
  Your Frontend / Client App
      │
      │  sends HTTP request WITH an API key in the header
      │  apikey: frontend-key-xyz789
      ▼
  Kong Gateway (port 8000)          ← the bouncer
      │
      ├─ Is there an API key?           No  → 401 Unauthorized. STOP.
      ├─ Is the key valid?              No  → 401 Unauthorized. STOP.
      ├─ Has this caller hit the limit? Yes → 429 Too Many Requests. STOP.
      │
      │  All checks passed.
      ▼
  Your Node.js App (port 3000)       ← finally gets the request
      │
      │  Kong injected headers telling Node WHO called:
      │  X-Consumer-Username: web-frontend
      │  X-Consumer-Custom-Id: frontend-app-001
      ▼
  Response flows back through Kong → to Frontend → to Rahul
```

Rahul (the end user) never knows API keys exist.
The frontend app holds the key and sends it on every request.
Kong is the only thing that ever touches the key — then strips it before Node sees it.

---

## The 4 Things You Create in Kong

```
1. UPSTREAM   → the load balancer pool (your container instances)
2. SERVICE    → your backend app registered with Kong
3. ROUTE      → the URL pattern Kong listens on
4. PLUGIN     → rules/protection that run on every request
5. CONSUMER   → the identity (app/client) allowed to call your API
```

> Wait — that's 5. Upstream is often forgotten but it's the foundation.
> Without it you can't load balance. Always define it first.

---

## 1. UPSTREAM — The Load Balancer Pool

### What it is
A pool of your backend instances. Kong distributes traffic across them.
Without an upstream you point Service directly to one IP — no load balancing.

### Why you need it
- Scale from 1 to N containers without changing your Service config
- Auto health checking — Kong stops sending to dead containers
- Weighted routing — send more traffic to bigger instances

### Full template with every option

```yaml
upstreams:
  - name: my-app-upstream          # REQUIRED. Must match exactly what Service.host uses.
                                   # This is how Service finds this upstream.

    algorithm: round-robin         # How Kong distributes requests across targets.
                                   # OPTIONS:
                                   # round-robin        → req1→target1, req2→target2, req3→target1...
                                   # least-connections  → always send to target with fewest active requests
                                   # consistent-hashing → same client IP always hits same target (good for sessions)
                                   # latency            → send to whichever target is responding fastest

    slots: 100                     # Granularity of the load balancing ring.
                                   # Higher = more even distribution.
                                   # 100   → fine for 2-5 targets
                                   # 1000  → better for 10+ targets
                                   # Range: 10 to 65536

    hash_on: none                  # Only relevant when algorithm: consistent-hashing
                                   # OPTIONS: none | ip | header | cookie | path | query_arg
                                   # Example: hash_on: ip → same IP always goes to same target

    hash_fallback: none            # Fallback if hash_on value is missing in request

    healthchecks:

      # ACTIVE: Kong proactively pings /health on every target at set intervals
      # Happens even when NO real traffic is flowing
      # Good for catching failures fast before users hit them
      active:
        type: http                 # OPTIONS: http | https | tcp
        http_path: /health         # The path Kong pings. Must return 2xx to be healthy.
        timeout: 5                 # Seconds to wait for health check response
        concurrency: 5             # How many targets to check simultaneously
        https_verify_certificate: true  # Set false if using self-signed certs

        healthy:
          interval: 10             # Ping every N seconds when target IS healthy
          successes: 2             # Need N consecutive 200s to mark as HEALTHY
          http_statuses:           # These status codes count as "healthy"
            - 200
            - 302

        unhealthy:
          interval: 5              # Ping every N seconds when target IS unhealthy (faster recovery check)
          http_failures: 3         # N consecutive bad responses = mark UNHEALTHY
          tcp_failures: 3          # N consecutive TCP failures (port unreachable) = UNHEALTHY
          timeouts: 3              # N consecutive timeouts = UNHEALTHY
          http_statuses:           # These status codes count as "unhealthy"
            - 429
            - 500
            - 502
            - 503
            - 504

      # PASSIVE: Kong watches REAL traffic going through — no extra pings
      # Learns from actual requests. Zero overhead.
      # Cannot detect failure until real traffic hits the dead target.
      # Use BOTH active + passive for best coverage.
      passive:
        type: http

        healthy:
          successes: 5             # N consecutive 2xx responses = mark HEALTHY again
          http_statuses:
            - 200
            - 201
            - 202
            - 203
            - 204

        unhealthy:
          http_failures: 5         # N consecutive failures on real traffic = UNHEALTHY
          tcp_failures: 3
          timeouts: 3
          http_statuses:
            - 500
            - 502
            - 503
            - 504

    # TARGETS: your actual backend instances
    # Add more targets = instant load balancing across them
    targets:
      - target: 127.0.0.1:3000    # host:port of your container/server
        weight: 100               # Relative weight. 100+100 = 50/50 split.
                                  # weight: 200 on one = it gets 2x traffic of weight:100 targets
                                  # weight: 0 = disabled (no traffic sent here)

      - target: 127.0.0.1:3001
        weight: 100

      # More targets = more load balancing. Just add lines here.
      # - target: 127.0.0.1:3002
      #   weight: 100
```

### Weight examples

```yaml
# Equal split (2 containers):
- target: 127.0.0.1:3000
  weight: 100
- target: 127.0.0.1:3001
  weight: 100

# 70/30 split (bigger server gets more):
- target: 127.0.0.1:3000
  weight: 70
- target: 127.0.0.1:3001
  weight: 30

# Canary deploy — 95% old, 5% new version:
- target: 127.0.0.1:3000    # old version
  weight: 95
- target: 127.0.0.1:3001    # new version (testing in production)
  weight: 5
```

---

## 2. SERVICE — Register Your App with Kong

### What it is
Your backend app's address, stored inside Kong's PostgreSQL.
Kong needs a Service to know WHERE to forward traffic.

### Why you need it
Without a Service, Kong has no destination.
One Service can have many Routes (multiple URL patterns pointing to the same app).

### Full template with every option

```yaml
services:
  - name: my-nodejs-app            # REQUIRED. Human-readable name. Used in logs and Admin API.
                                   # Letters, numbers, hyphens only. No spaces.

    # ── HOW TO POINT TO YOUR BACKEND ──────────────────────────────────────────
    #
    # OPTION A: Point directly to an IP (no load balancing)
    # url: http://127.0.0.1:3000
    # Use this when you have ONE instance and don't need load balancing.
    #
    # OPTION B: Point to an Upstream (enables load balancing) ← RECOMMENDED
    # host: my-app-upstream
    # Kong sees the upstream name, looks it up, gets all targets.
    # ──────────────────────────────────────────────────────────────────────────

    host: my-app-upstream          # Use your upstream name here for load balancing
                                   # OR use 127.0.0.1 directly for single instance
    port: 80                       # Port on the upstream/host side
    protocol: http                 # OPTIONS: http | https | grpc | grpcs | tcp | tls | ws | wss

    # Alternatively use the shorthand url (only for single host, no upstream):
    # url: http://127.0.0.1:3000   # expands to protocol+host+port automatically

    # ── TIMEOUTS ──────────────────────────────────────────────────────────────
    connect_timeout: 60000         # Milliseconds Kong waits to open TCP connection to your app
                                   # If your app is slow to start, increase this
    read_timeout: 60000            # Milliseconds Kong waits for your app to send a response
                                   # Increase for endpoints that do heavy processing
    write_timeout: 60000           # Milliseconds Kong waits to finish sending request to your app

    # ── RETRIES ───────────────────────────────────────────────────────────────
    retries: 3                     # If your app fails (connection error, timeout), retry N times
                                   # Kong tries the NEXT healthy target on each retry
                                   # Set to 0 to disable retries

    # ── ROUTES go nested under the service ────────────────────────────────────
    routes:
      - ...                        # See Routes section below

    # ── PLUGINS scoped to this service ────────────────────────────────────────
    plugins:
      - ...                        # See Plugins section below

    enabled: true                  # Set false to disable this service without deleting it
                                   # All routes to this service return 503 when disabled

    tags:                          # Optional labels for filtering in Admin API
      - production
      - nodejs
```

---

## 3. ROUTE — The URL Front Door

### What it is
The matching rule. When a request comes in, Kong checks all routes.
The first route that matches decides which Service gets the request.

### Why you need it
Kong can manage MANY apps at once on port 8000.
Routes are how Kong knows which request goes to which app.

```
GET  /users    → users-service     (your Node app)
POST /orders   → orders-service    (some other app)
GET  /payments → payments-service  (yet another app)

All hitting port 8000. Kong routes them correctly via Route rules.
```

### Full template with every option

```yaml
routes:
  - name: my-route-name            # REQUIRED. Unique name. Used in logs.

    # ── MATCHING RULES ─────────────────────────────────────────────────────────
    # Kong matches requests using ANY combination of these.
    # More specific = higher priority (Kong picks most specific match).
    # You can use paths alone, hosts alone, or combine them.

    paths:                         # URL path prefix matching
      - /api/v1                    # Matches: /api/v1, /api/v1/users, /api/v1/anything
      - /output                    # Matches: /output, /output/anything

    methods:                       # HTTP methods this route accepts
      - GET                        # OPTIONS: GET POST PUT PATCH DELETE HEAD OPTIONS TRACE CONNECT
      - POST
      - PUT
      - PATCH
      - DELETE

    hosts:                         # Match by Host header (domain-based routing)
      - api.mycompany.com          # Only requests to this domain hit this route
      - "*.mycompany.com"          # Wildcard — any subdomain

    headers:                       # Match by specific request headers
      X-Version:                   # Only match if this header exists with this value
        - v2

    # ── PATH BEHAVIOUR ─────────────────────────────────────────────────────────
    strip_path: false              # What happens to the matched path prefix:
                                   #
                                   # strip_path: FALSE (recommended for most apps)
                                   # Client hits: /api/v1/users
                                   # Kong sends:  /api/v1/users  → Node receives full path
                                   #
                                   # strip_path: TRUE
                                   # Client hits: /api/v1/users
                                   # Kong sends:  /users          → /api/v1 is stripped
                                   # Use this when your Node app doesn't know about /api/v1 prefix

    preserve_host: false           # What goes in the Host header sent to your Node app:
                                   #
                                   # preserve_host: FALSE (default)
                                   # Kong sends its own hostname in Host header
                                   #
                                   # preserve_host: TRUE
                                   # Kong forwards the original Host header from the client
                                   # Use this when your Node app needs the original domain

    # ── PROTOCOLS ──────────────────────────────────────────────────────────────
    protocols:                     # Which protocols this route accepts
      - http
      - https                      # OPTIONS: http | https | grpc | grpcs | ws | wss

    # ── ADVANCED ───────────────────────────────────────────────────────────────
    regex_priority: 0              # When multiple routes match, higher number wins
                                   # Default 0. Increase if this route should win over others.

    path_handling: v0              # OPTIONS: v0 | v1
                                   # v0: legacy path handling (default)
                                   # v1: newer behaviour, use when strip_path causes issues

    https_redirect_status_code: 426  # Status code when redirecting HTTP → HTTPS
                                     # OPTIONS: 301 | 302 | 307 | 308 | 426

    request_buffering: true        # Buffer full request before sending to upstream
                                   # Set false for streaming/large file uploads

    response_buffering: true       # Buffer full response before sending to client
                                   # Set false for streaming responses (SSE, chunked)
```

### Route matching examples

```yaml
# Match everything (catch-all):
paths: [/]
methods: [GET, POST, PUT, PATCH, DELETE]

# Match only one endpoint:
paths: [/output]
methods: [GET]

# Match by domain only (no path filter):
hosts: [api.mycompany.com]

# Match by domain AND path:
hosts: [api.mycompany.com]
paths: [/v2]

# Match by header (version routing):
headers:
  X-API-Version:
    - "2"
```

---

## 4. PLUGINS — Rules That Run On Every Request

### What it is
Middleware that Kong runs on requests/responses.
Each plugin has a specific job. You attach them to a Service, Route, or Consumer.

### Plugin scope — where you attach matters

```
GLOBAL plugin      → runs on ALL requests to ALL services
SERVICE plugin     → runs on all requests to ONE service (all its routes)
ROUTE plugin       → runs on requests to ONE specific route only
CONSUMER plugin    → runs only when a specific consumer is authenticated
```

```yaml
# Global (outside services block — top level):
plugins:
  - name: rate-limiting
    config:
      minute: 100

# Service-level (nested under a service):
services:
  - name: my-app
    plugins:
      - name: key-auth

# Route-level (nested under a route):
routes:
  - name: my-route
    plugins:
      - name: ip-restriction
```

---

### Plugin: key-auth

**What it does:** Requires every request to carry a valid API key.
No key = 401. Wrong key = 401. Valid key = request goes through + Kong injects consumer identity headers.

```yaml
- name: key-auth
  enabled: true                    # Set false to temporarily disable without deleting

  config:
    key_names:                     # Header/query param names Kong looks for the key in
      - apikey                     # Accepts: apikey: abc123
      - x-api-key                  # Accepts: x-api-key: abc123
                                   # Add as many names as you want

    key_in_header: true            # Accept key in request headers ← always true
    key_in_query: true             # Accept key as ?apikey=abc123 ← useful for testing
                                   # WARNING: query params appear in server logs
                                   # Set false in strict production environments
    key_in_body: false             # Accept key in request body ← always false
                                   # Body params appear in logs, bad for secrets

    hide_credentials: true         # IMPORTANT: Strip the key before forwarding to your app
                                   # true  → Node never sees the raw API key (recommended)
                                   # false → Node receives the apikey header (avoid)

    anonymous: null                # UUID of a consumer to use when NO key is provided
                                   # Useful for public + authenticated mixed access:
                                   # No key → treated as "anonymous" consumer (limited access)
                                   # Valid key → treated as that consumer (full access)
                                   # Leave null to require key from everyone (default)
```

**What Kong injects into your Node app after key-auth passes:**

```
X-Consumer-ID:        <kong internal uuid>
X-Consumer-Username:  postman-tester
X-Consumer-Custom-ID: dev-testing-001
X-Credential-Identifier: <key uuid>
```

Your Node reads these:
```javascript
const caller = req.headers['x-consumer-username']   // "postman-tester"
const id     = req.headers['x-consumer-custom-id']  // "dev-testing-001"
```

---

### Plugin: rate-limiting

**What it does:** Counts requests and blocks callers who exceed the limit with HTTP 429.
Your Node app never sees blocked requests.

```yaml
- name: rate-limiting
  enabled: true

  config:
    # ── LIMITS (set any combination) ─────────────────────────────────────────
    second: null                   # Max requests per second
    minute: 60                     # Max requests per minute  ← most common
    hour: 2000                     # Max requests per hour
    day: 10000                     # Max requests per day
    month: null                    # Max requests per month
    year: null                     # Max requests per year
    # You can combine: minute: 60 AND hour: 500
    # Kong enforces ALL limits simultaneously

    # ── WHO GETS THEIR OWN COUNTER ─────────────────────────────────────────
    limit_by: consumer             # Each consumer gets their own bucket
                                   # OPTIONS:
                                   # consumer    → per authenticated consumer (recommended)
                                   # ip          → per client IP address
                                   # credential  → per API key (similar to consumer)
                                   # service     → shared limit across ALL callers to this service
                                   # header      → per value of a specific header
                                   # path        → per URL path

    header_name: null              # Only used when limit_by: header
                                   # Example: header_name: X-Tenant-ID

    # ── WHERE COUNTERS ARE STORED ─────────────────────────────────────────
    policy: local                  # OPTIONS:
                                   # local  → stored in Kong's shared memory on THIS node
                                   #          Fast. No external dependency.
                                   #          Problem: each Kong node has its own counter.
                                   #          With 3 Kong nodes, effective limit is 3x your setting.
                                   #          Fine for single Kong node (your setup right now).
                                   #
                                   # redis  → stored in Redis (shared across ALL Kong nodes)
                                   #          Accurate limit regardless of how many Kong nodes.
                                   #          Use this when you run multiple Kong instances.
                                   #
                                   # cluster → stored in PostgreSQL (deprecated, slow)

    # ── REDIS CONFIG (only needed when policy: redis) ─────────────────────
    redis:
      host: 127.0.0.1
      port: 6379
      password: null
      database: 0
      timeout: 2000
      ssl: false

    # ── BEHAVIOUR ─────────────────────────────────────────────────────────
    hide_client_headers: false     # false → send X-RateLimit-* headers to client (informative)
                                   # true  → hide rate limit info from client (stealth mode)

    fault_tolerant: true           # What to do if the counter store fails:
                                   # true  → let requests through (don't block users on Kong failure)
                                   # false → block all requests if counter fails (strict)

    error_code: 429                # HTTP status code returned when limit exceeded
    error_message: "API rate limit exceeded"  # Message in the response body

    sync_rate: -1                  # Only for redis policy. How often (seconds) to sync
                                   # local counters to Redis. -1 = sync every request (accurate)
                                   # Higher number = faster but less accurate
```

**What the client sees when rate limited:**

```
HTTP 429 Too Many Requests

Headers:
  X-RateLimit-Limit-Minute: 60
  X-RateLimit-Remaining-Minute: 0
  X-RateLimit-Reset: 1234567890   ← unix timestamp when the window resets
  Retry-After: 47                 ← seconds until they can try again

Body:
  {"message": "API rate limit exceeded"}
```

---

### Plugin: response-transformer

**What it does:** Modifies response headers/body AFTER your Node app responds,
BEFORE the response reaches the client.

```yaml
- name: response-transformer
  enabled: true

  config:
    # ── REMOVE headers from response ──────────────────────────────────────
    remove:
      headers:
        - X-Powered-By             # Hides "X-Powered-By: Express" — don't reveal stack
        - Server                   # Hides "Server: nginx/1.18" — don't reveal server version
        - X-Internal-RequestId     # Remove any internal tracking headers

    # ── ADD headers to response ───────────────────────────────────────────
    add:
      headers:
        - "X-Content-Type-Options:nosniff"    # Prevents MIME type sniffing attacks
        - "X-Frame-Options:DENY"              # Prevents your page being iframed (clickjacking)
        - "X-XSS-Protection:1; mode=block"   # Enables browser XSS filter
        - "Cache-Control:no-store"            # Don't cache sensitive API responses

    # ── REPLACE headers (overwrite if exists, add if not) ────────────────
    replace:
      headers:
        - "Access-Control-Allow-Origin:https://myapp.com"

    # ── RENAME headers ───────────────────────────────────────────────────
    rename:
      headers:
        - "X-Old-Name:X-New-Name"
```

---

### Plugin: request-transformer

**What it does:** Modifies the request BEFORE it reaches your Node app.
Runs before your app sees anything.

```yaml
- name: request-transformer
  enabled: true

  config:
    # ── ADD headers to the request going to Node ──────────────────────────
    add:
      headers:
        - "X-Gateway:kong"                    # Tell Node this came through Kong
        - "X-Environment:production"          # Inject environment info

    # ── REMOVE headers before forwarding to Node ──────────────────────────
    remove:
      headers:
        - X-Internal-Secret                   # Strip secrets clients might send
        - Cookie                              # Strip cookies if your API is stateless

    # ── ADD query parameters ──────────────────────────────────────────────
    add:
      querystring:
        - "source:kong"                       # Append ?source=kong to every request

    # ── REMOVE query parameters ───────────────────────────────────────────
    remove:
      querystring:
        - debug                               # Strip ?debug=true before reaching Node
```

---

### Plugin: cors

**What it does:** Handles Cross-Origin Resource Sharing.
Required if your frontend (React on localhost:3000) calls your API on a different domain.

```yaml
- name: cors
  enabled: true

  config:
    origins:                       # Which domains are allowed to call your API
      - "https://myapp.com"        # Specific domain (recommended for production)
      - "http://localhost:3000"    # Your local React dev server
      - "*"                        # ANY domain (use only for fully public APIs)

    methods:                       # Allowed HTTP methods
      - GET
      - POST
      - PUT
      - PATCH
      - DELETE
      - OPTIONS

    headers:                       # Headers clients are allowed to send
      - Accept
      - Content-Type
      - Authorization
      - apikey                     # Your API key header must be listed here!
      - x-api-key

    exposed_headers:               # Headers clients are allowed to read in response
      - X-RateLimit-Limit-Minute
      - X-RateLimit-Remaining-Minute

    credentials: true              # Allow cookies and auth headers in cross-origin requests
                                   # MUST be true if using Authorization header from browser

    max_age: 3600                  # How long browsers cache preflight results (seconds)
                                   # 3600 = 1 hour. Reduces OPTIONS preflight requests.

    preflight_continue: false      # false = Kong handles OPTIONS preflight itself (recommended)
                                   # true  = forwards OPTIONS to your Node app
```

---

### Plugin: ip-restriction

**What it does:** Allow or block specific IP addresses.
Only allow your office IP to hit the admin routes, for example.

```yaml
- name: ip-restriction
  enabled: true

  config:
    allow:                         # Whitelist — only these IPs can access
      - 192.168.1.0/24             # Entire subnet
      - 10.0.0.1                   # Single IP
    # deny:                        # Blacklist — block these IPs, allow everyone else
    #   - 1.2.3.4
    # Use either allow OR deny, not both
    status: 403                    # Status code returned to blocked IPs
    message: "Access denied"
```

---

### Plugin: proxy-cache

**What it does:** Caches your Node app's responses in Kong's memory.
Identical requests return instantly without hitting Node at all.

```yaml
- name: proxy-cache
  enabled: true

  config:
    response_code:                 # Only cache these response status codes
      - 200
      - 301
    request_method:                # Only cache these HTTP methods
      - GET
      - HEAD
    content_type:                  # Only cache these content types
      - application/json
    cache_ttl: 300                 # Cache entries expire after N seconds (300 = 5 minutes)
    strategy: memory               # OPTIONS: memory (built-in) | redis (external)
    cache_control: false           # Respect Cache-Control headers from your Node app
```

---

## 5. CONSUMERS — Who Is Allowed to Call Your API

### What it is
A Consumer = a name + an API key.
Represents a CALLER (an application or service), not an end user.

### The distinction that trips everyone up

```
END USER (Rahul, Priya, whoever)
  → the human clicking buttons in your app
  → Kong never sees them directly
  → Kong doesn't care about them

CONSUMER (postman-tester, web-frontend, mobile-app)
  → the APPLICATION calling your API
  → holds the API key
  → Kong tracks, limits, and identifies by consumer
  → your Node app knows which consumer called via headers
```

### How normal users connect

```
Normal user opens your React app in browser
      │
      ▼
React app makes API call:
  fetch('http://your-server:8000/output', {
    headers: {
      'apikey': 'frontend-key-xyz789'   ← consumer key, stored in React app
    }
  })
      │
      ▼
Kong receives request
  Validates key → matches consumer "web-frontend"
  Injects headers:
    X-Consumer-Username: web-frontend
    X-Consumer-Custom-Id: frontend-app-001
      │
      ▼
Node app receives request
  Sees X-Consumer-Username: web-frontend
  Knows "this came from the frontend app"
  Does NOT know it was Rahul specifically
  (user identity is your app's job, not Kong's)
      │
      ▼
Response goes back to React → Rahul sees the result
```

### Full template with every option

```yaml
consumers:
  - username: postman-tester       # REQUIRED. Unique name. Appears in logs and headers.
                                   # Use meaningful names: web-frontend, mobile-ios, partner-acme

    custom_id: dev-testing-001     # YOUR internal ID. Map this to your own system.
                                   # Could be a UUID, user ID, app ID — anything you want.
                                   # Injected as X-Consumer-Custom-ID to your Node app.

    tags:                          # Optional labels for organizing consumers
      - internal
      - testing

    # ── CREDENTIALS ───────────────────────────────────────────────────────────
    # These are the actual API keys for this consumer.
    # One consumer can have MULTIPLE keys (rotate keys without downtime).

    keyauth_credentials:
      - key: postman-key-abc123    # The actual key value sent in requests
                                   # In production: omit this to let Kong generate a random key
                                   # Then retrieve it: curl localhost:8001/consumers/name/key-auth

      # A consumer can have multiple keys — useful for key rotation:
      # - key: postman-key-abc123  ← old key (keep working during rotation)
      # - key: postman-key-new456  ← new key (start using this)
      # Once all clients use the new key, delete the old one.

    # ── PER-CONSUMER PLUGINS ─────────────────────────────────────────────────
    # Override service-level plugin config for THIS consumer specifically
    # Example: give a premium consumer a higher rate limit

  - username: premium-client
    custom_id: premium-001
    keyauth_credentials:
      - key: premium-key-vip999
    # This consumer gets its own rate limit plugin:
    # (attached via Admin API after sync — not directly in consumer block)
```

### Consumer-specific rate limits

You can give different consumers different rate limits:

```yaml
# In your kong-config.yaml, after deck sync,
# apply a per-consumer plugin via curl:

# Regular consumer: 10 req/min (from service-level plugin)
# Premium consumer: 1000 req/min (overridden here)
```

```bash
# Give premium-client their own higher limit:
curl -X POST http://localhost:8001/consumers/premium-client/plugins \
  -d name=rate-limiting \
  -d config.minute=1000 \
  -d config.policy=local
```

Or in deck yaml, nest plugins under a route that checks consumer:

---

## Putting It All Together — The Complete Reference Template

```yaml
_format_version: "3.0"

# ── 1. UPSTREAM (define first — service references it by name) ─────────────
upstreams:
  - name: my-app-upstream
    algorithm: round-robin
    slots: 100
    healthchecks:
      active:
        http_path: /health
        healthy:
          interval: 10
          successes: 2
        unhealthy:
          interval: 5
          http_failures: 3
    targets:
      - target: 127.0.0.1:3000
        weight: 100
      # Scale: just add more targets here

# ── 2. SERVICE (points to upstream, contains routes + plugins) ─────────────
services:
  - name: my-nodejs-app
    host: my-app-upstream          # matches upstream name above
    port: 80
    protocol: http
    connect_timeout: 60000
    read_timeout: 60000
    write_timeout: 60000
    retries: 3

    # ── 3. ROUTES ────────────────────────────────────────────────────────────
    routes:
      - name: main-route
        paths: [/]
        methods: [GET, POST, PUT, PATCH, DELETE]
        strip_path: false
        protocols: [http, https]

      - name: health-route          # No auth on this one
        paths: [/health]
        methods: [GET]
        strip_path: false

    # ── 4. PLUGINS ───────────────────────────────────────────────────────────
    plugins:
      - name: key-auth
        config:
          key_names: [apikey, x-api-key]
          hide_credentials: true

      - name: rate-limiting
        config:
          minute: 60
          policy: local
          limit_by: consumer
          fault_tolerant: true

      - name: cors
        config:
          origins: ["http://localhost:3000", "https://myapp.com"]
          methods: [GET, POST, PUT, PATCH, DELETE, OPTIONS]
          headers: [Content-Type, apikey, x-api-key]
          credentials: true

      - name: response-transformer
        config:
          remove:
            headers: [X-Powered-By, Server]
          add:
            headers:
              - "X-Content-Type-Options:nosniff"
              - "X-Frame-Options:DENY"

# ── 5. CONSUMERS (who can call the API) ────────────────────────────────────
consumers:
  - username: postman-tester
    custom_id: dev-001
    keyauth_credentials:
      - key: postman-key-abc123

  - username: web-frontend
    custom_id: frontend-001
    keyauth_credentials:
      - key: frontend-key-xyz789

  - username: mobile-app
    custom_id: mobile-001
    keyauth_credentials:
      - key: mobile-key-mno456
```

---

## Quick Decision Guide

```
"I want to protect my API with auth"
  → Add key-auth plugin to your service
  → Create consumers with keys
  → Clients send: apikey: their-key

"I want to limit how many requests per minute"
  → Add rate-limiting plugin
  → limit_by: consumer (individual limits)
  → limit_by: ip (limits by IP, no consumers needed)

"I want to load balance across 2 containers"
  → Define an upstream with 2 targets
  → Point your service host to the upstream name

"I want one endpoint to be public, others to need auth"
  → Put key-auth on the service (applies to all routes)
  → Create the public route WITHOUT key-auth plugin
  → Use route-level plugin to disable: add key-auth with enabled: false

"I want to hide that I'm using Express/Node"
  → Add response-transformer plugin
  → Remove: X-Powered-By, Server

"My frontend (React) needs to call the API from browser"
  → Add cors plugin
  → Add your frontend domain to origins
  → Add apikey to headers list

"I want to give one client a higher rate limit"
  → Create their consumer
  → Apply rate-limiting plugin directly to that consumer via Admin API
  → Consumer-level plugin overrides service-level plugin
```

---

## decK Commands Reference

```bash
# Preview changes (ALWAYS run before sync)
deck gateway diff kong-config.yaml

# Apply config to Kong (live, no restart)
deck gateway sync kong-config.yaml

# Export current Kong state to a file
deck gateway dump --output-file kong-current.yaml

# Validate your YAML file for syntax errors
deck gateway validate kong-config.yaml

# Wipe everything from Kong (careful!)
deck gateway reset

# Apply and automatically approve (CI/CD pipelines)
deck gateway sync kong-config.yaml --no-interact
```

---
*Kong 3.6 · decK 1.38 · Reference for Services, Routes, Plugins, Consumers*