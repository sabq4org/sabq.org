# Edge IP signing rollout

`sabq.org` proxies API requests through the Cloudflare Pages Function. A
Pages/Worker subrequest can have a shared `cf-connecting-ip`, so the backend
must not use an unsigned `X-Sabq-Client-IP` supplied by a browser. The target backend contract
accepts that address only when it has a fresh HMAC signature bound to the HTTP
method, path plus query, timestamp, and address.

This first delivery installs signing consumers and an unused verifier utility only.
The current backend resolver remains unchanged until the separate enforcement PR.

## Configuration

Use a separate high-entropy `EDGE_PROXY_SHARED_SECRET` in Railway, Cloudflare
Pages, Railway web-next, and `sabq-api-origin`. Keep
`EDGE_PROXY_IP_ACCEPT` unset until all required edge paths are configured;
set it to `on` only after the smoke tests pass. Do not put the secret in Git or
in a Wrangler `[vars]` block. The API Worker defaults to the
Railway generated hostname and must never point at `api.sabq.org`, which would
loop through its own route.

The verifier is fail-safe against spoofing when the secret is absent: unsigned
custom headers are ignored and Express/socket address resolution is used. This
does **not** preserve the intended per-visitor rate-limit behavior through a
Pages proxy; without the secret, visitors can collapse behind the proxy IP.
The Pages/Worker route must not be enabled until the secret is present. Set
`EDGE_PROXY_GATE_REQUIRED=on` at the edge to return `503` for API and indexable
SEO paths instead of silently proxying or producing an empty SEO shell when the
secret is missing; the optional API Worker already does this.

`EDGE_PROXY_IP_ACCEPT=on` is the API-side acceptance flag. It enables use
of valid signed addresses but does not restrict access to the Railway origin.
The API gate enforces signatures for API paths after the staged gateway cutover.
It does not provide network-level isolation of Railway or protect non-API paths.

## Rollout

1. Configure one shared secret in Cloudflare Pages, the API Worker, Railway API,
   and Railway web-next. Keep `EDGE_PROXY_GATE_REQUIRED` off.
2. Deploy the **signing consumers only** first: Pages, API Worker, and web-next.
   Keep the existing backend IP resolver active during this phase. Do not deploy
   the replacement resolver with IP acceptance off: that would collapse visitors
   behind their proxy IP.
3. Route `api.sabq.org/*` to the configured API Worker and verify web/mobile,
   metadata GET/HEAD, streamed writes, webhooks and internal SSR reads. The
   generated Railway hostname is the Worker target; it must not loop to api.sabq.org.
4. Stage `EDGE_PROXY_IP_ACCEPT=on` in Railway API, then deploy the backend
   verifier/resolver. Both ingress paths must already sign requests. Verify
   per-visitor keys and internal service identity before enforcement.
5. Enable `EDGE_PROXY_GATE_REQUIRED=on` in Railway API and Pages. Confirm a
   direct unsigned Railway API request fails403, public API routes continue to
   work, and `/health` stays available. Do not claim network-level isolation.
6. Keep `frontend-edge-worker.js` dormant: its legacy write proxy is not part of
   this rollout and must not be reactivated as a rollback shortcut.

## Rollback

If enforcement rejects a legitimate consumer, restore that consumer's signing
configuration or temporarily turn off the API gate while keeping signature
acceptance on. Keep the signing gateways routed until the backend deployment
has been reverted too. Removing a gateway first could collapse IP buckets or
break all gated requests. Never restore arbitrary Bearer-derived buckets.

## Required verification

- Fresh, path/query/method-bound signatures are accepted.
- Expired, malformed, replayed outside the time window, or altered signatures
  are ignored.
- Browser-supplied `X-Sabq-*`, `cf-connecting-ip`, and `X-Forwarded-For` values
  do not control the key.
- Arbitrary Bearer strings from the same source share the source bucket until
  route authentication establishes a user identity.
- `api.sabq.org`, the Railway generated hostname, Pages API proxy, web-next
  GETs, and signed webhooks remain reachable with their existing contracts.
