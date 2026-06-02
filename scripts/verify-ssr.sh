#!/usr/bin/env bash
#
# Post-deploy verification for the P3 SSR migration (web-next + Cloudflare
# SSR_ROUTES). Runs read-only curl checks against the public site and the API.
#
# Usage:
#   scripts/verify-ssr.sh <ARTICLE_ENGLISH_SLUG> [CATEGORY_SLUG] [SITE] [API]
#
# Example:
#   scripts/verify-ssr.sh qzVBFf1 saudi https://sabq.org https://api.sabq.org
#
# Exit code is non-zero if any hard check fails.

set -uo pipefail

ARTICLE_SLUG="${1:-}"
CATEGORY_SLUG="${2:-saudi}"
SITE="${3:-https://sabq.org}"
API="${4:-https://api.sabq.org}"

if [[ -z "$ARTICLE_SLUG" ]]; then
  echo "usage: $0 <ARTICLE_ENGLISH_SLUG> [CATEGORY_SLUG] [SITE] [API]" >&2
  exit 2
fi

fails=0
pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; fails=$((fails + 1)); }

echo "▶ 1) API bundle endpoints"

bundle="$(curl -fsS "$API/api/articles/$ARTICLE_SLUG/seo-bundle" 2>/dev/null)"
if [[ -n "$bundle" ]] && grep -q '"contentHtml"' <<<"$bundle" && grep -q '"jsonLd"' <<<"$bundle"; then
  pass "article seo-bundle returns contentHtml + jsonLd"
else
  fail "article seo-bundle missing or incomplete (deploy the API first?)"
fi

if curl -fsS "$API/api/categories/$CATEGORY_SLUG/seo-bundle" 2>/dev/null | grep -q '"articles"'; then
  pass "category seo-bundle returns articles[]"
else
  fail "category seo-bundle missing"
fi

if curl -fsS "$API/api/edge/home-bundle" 2>/dev/null | grep -q '"articles"'; then
  pass "home-bundle returns articles[]"
else
  fail "home-bundle missing"
fi

echo "▶ 2) SSR HTML in the first byte (full text + JSON-LD, single meta block)"

html="$(curl -fsS "$SITE/article/$ARTICLE_SLUG" 2>/dev/null)"
if grep -q 'id="main-content"' <<<"$html"; then
  pass "<main id=main-content> present"
else
  fail "<main id=main-content> missing (SSR_ROUTES on? NEXT_ORIGIN set?)"
fi
grep -q '<h1' <<<"$html" && pass "<h1> present" || fail "<h1> missing"
grep -q 'application/ld+json' <<<"$html" && pass "JSON-LD present" || fail "JSON-LD missing"

# SSR routes must SKIP edge injection — the edge marker must NOT appear.
marker_count="$(grep -c 'sabq-edge-meta-injected' <<<"$html")"
if [[ "$marker_count" == "0" ]]; then
  pass "no edge-injection marker (no double injection)"
else
  fail "edge-injection marker present ($marker_count) — double injection!"
fi

# Exactly one <title>.
title_count="$(grep -oc '<title' <<<"$html")"
[[ "$title_count" == "1" ]] && pass "exactly one <title>" || fail "<title> count = $title_count"

echo "▶ 3) Edge cache (repeat hit should be HIT)"
curl -fsS -o /dev/null "$SITE/article/$ARTICLE_SLUG" 2>/dev/null
cache_state="$(curl -fsS -D - -o /dev/null "$SITE/article/$ARTICLE_SLUG" 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="x-edge-cache"{print $2}')"
if [[ "$cache_state" == "HIT" ]]; then
  pass "x-edge-cache: HIT"
else
  echo "  ⚠️  x-edge-cache: ${cache_state:-<none>} (may need a second warm hit)"
fi

echo "▶ 4) Category + home SSR"
if curl -fsS "$SITE/category/$CATEGORY_SLUG" 2>/dev/null | grep -q 'id="main-content"'; then
  pass "category SSR <main> present"
else
  fail "category SSR <main> missing"
fi
if curl -fsS "$SITE/" 2>/dev/null | grep -q 'id="main-content"'; then
  pass "home SSR <main> present"
else
  fail "home SSR <main> missing"
fi

echo
if [[ "$fails" -eq 0 ]]; then
  echo "✅ ALL HARD CHECKS PASSED"
  exit 0
else
  echo "❌ $fails hard check(s) failed"
  exit 1
fi
