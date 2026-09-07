# Edge IP signing rollout

`sabq.org` proxies API requests through the Cloudflare Pages Function. A
Pages/Worker subrequest can have a shared `cf-connecting-ip`, so the backend
must not use an unsigned `X-Sabq-Client-IP` supplied by a browser. The backend
accepts that address only when it has a fresh HMAC signature bound to the HTTP
method, path plus query, timestamp, and address.

## Configuration

Use a separate high-entropy `EDGE_PROXY_SHARED_SECRET` in Railway, Cloudflare
Pages, and (only if its routes are restored) `sabq-api-origin`. Keep
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
Origin access control requires a separate Cloudflare gateway/allowlist cutover;
do not describe this HMAC patch as origin isolation.

## Rollout

1. Deploy the API verifier with both flags off. This preserves the current
   service but does not remove the existing Pages bucket-collapse risk.
2. Configure the same secret in Pages, `web-next`, and Railway. Deploy the
   signed Pages/SSR consumers while the API gate remains off.
3. Set `EDGE_PROXY_IP_ACCEPT=on` in Railway and confirm separate rate-limit
   keys through `sabq.org/api/*`; confirm `web-next` can read its internal
   `sabqorg.railway.internal` API origin with its fixed service identity.
4. Add the secret to the API Worker, verify the Railway generated hostname, and
   restore the exact `api.sabq.org/*` route. This covers mobile,
   meetings-agent, and third-party webhooks.
5. Set `EDGE_PROXY_GATE_REQUIRED=on` in Railway and Pages only after those
   consumers pass smoke tests. `/health` and `/ready` remain public.
6. Monitor 401/403/429 responses, `rate-limit-remaining`, and webhook delivery
   for at least one normal traffic window.
## Rollback

Remove the edge route or set `EDGE_PROXY_GATE_REQUIRED=off` only if the API
secret remains configured; do not re-enable unsigned custom-header trust. The
API falls back to its configured `req.ip`/socket chain. If that temporarily
collapses anonymous buckets, lower traffic-sensitive limits only after
observing the live counters; never use a client Bearer value as a substitute
identity.

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
