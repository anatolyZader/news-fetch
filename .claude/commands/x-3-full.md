---
allowed-tools: Bash(curl -s*), Bash(jq*), Bash(mkdir -p business_modules/social_media/data*), Bash(test*), Bash(printf*), Bash(date*), Bash(echo*), Bash(ls business_modules/social_media/data/*), Bash(cat business_modules/social_media/data/*), Bash(wc -l*), Bash(head*), Bash(tail*), Bash(grep -E*), Bash(mv business_modules/social_media/data/*), Bash(rm business_modules/social_media/data/*), Bash(node business_modules/social_media/input/socialMediaInput.js*), Write, Read, Edit
description: Fetch X (Twitter) posts and comments from the last 3 days that report population behavior relevant to the 8-component resilience analysis. National scope by default (--north to restrict). Dry-run by default — must pass --execute to spend X API credits. The X analogue of the news-sites homefront-extract pipeline.
---

## Your task

Sweep X for citizen-voice posts (and optionally replies) over the last 3 days that report **population behavior under emergency conditions** in Israel, suitable for the 8-component resilience analysis. The vocabulary comes from `HOMEFRONT_KEYWORDS` (he/ar/ru) — partitioned into 2 thematic clusters per language to fit X's 512-char query limit. This is the X analogue of `runExtractHomefrontArticles` in the news-sites module: broad fetch → strict relevance pre-filter → 8-component mapping → canonical daily bundle.

**You spend real money on TWO meters: X API credits AND Claude API tokens.** Cost-discipline rules below are mandatory.

---

## Arguments

- `--execute` — perform paid `search/recent` calls. Absent → dry-run only.
- `--with-replies` — fetch replies for the top 20 most-discussed citizen candidates. Implies `--execute`. Roughly doubles X cost.
- `--max-per-query N` — posts per (date × language × cluster) call. Default `50`, ceiling `100`.
- `--max-cost-usd X` — pre-flight X-spend abort threshold. Default `5.00`.
- `--north` — AND each cluster query with the north-Israel locality clause (restricts geographic scope). Default: national.
- `--lang LIST` — comma list from `{he,ar,ru,en}`. Default `he,ar,ru`.
- `--candidate-cap N` — hard cap on candidates Claude classifies. Default `100`, ceiling `150`.
- Optional date `dd:mm:yyyy` — anchor for the 3-day window. Absent → today (Asia/Jerusalem). Future → abort.

---

## Cost discipline (READ BEFORE ANY STEP)

Apply these rules:

1. **Never `Read` a raw X JSON file.** jq-summarize, ingest slim summaries only.
2. **Slim deduped candidate file is the single source of truth for classification.** Build once, read once.
3. **Hard cap on classification batch: `--candidate-cap` (default 100).** Overflow → `rejected.off_topic += dropped`.
4. **No exploratory re-reads.**
5. **`wc -l`, not `Read`, to count lines.**
6. **Per Bash invocation, output ≤200 lines.**
7. **Skip Steps 2+ in dry-run.** Only Step 0 (queries) and Step 1 (`counts/recent`) run.
8. **No agent spawning.** Single-pass, single-context.

### Target spend per 3-day run

| Meter | Dry-run | --execute | --execute --with-replies |
|---|---|---|---|
| X API | ≤$0.15 | ≤$5 | ≤$10 |
| Claude API | ≤$0.05 | ≤$2 | ≤$3 |

Dry-run runs `counts/recent` for **2 clusters × 3 langs × 3 days = 18 calls** (vs 9 for single-topic commands).

---

## Pre-flight

**P1.** Token:
```
test -n "$X_BEARER_TOKEN" || {
  VAL=$(grep -E '^X_BEARER_TOKEN=' .env | head -1 | sed 's/^X_BEARER_TOKEN=//')
  VAL=$(printf '%s' "$VAL" | tr -d "\"'")
  export X_BEARER_TOKEN="$VAL"
}
test -n "$X_BEARER_TOKEN" || { echo "X_BEARER_TOKEN is not set. Aborting before any spend."; exit 1; }
```

**P2.** `mkdir -p business_modules/social_media/data`.

**P3.** Compute the 3 UTC dates (target, target-1, target-2). Clamp `end_time` to `now-60s` when the slot day is today UTC.

**P4.** Spend log: `business_modules/social_media/data/x-spend-log-full-<target>.jsonl`. Never write the bearer token there.

---

## Step 0 — Build cluster queries

Two thematic clusters per language. Each cluster query is `(<terms>) [(<locality>)] lang:<code> -is:retweet`, ≤512 chars. Locality clause appears **only if `--north` is passed**.

### Cluster A — operational / behavioral (alerts, sheltering, evacuation, schools, civil defense)

- **he** (A): `(אזעקה OR "צבע אדום" OR מקלט OR "מרחב מוגן" OR "פיקוד העורף" OR פינוי OR מפונים OR התראה OR "בתי הספר" OR "למידה מרחוק" OR חירום OR "הוראות העורף" OR נפילה OR שיגורים OR "מד״א" OR חילוץ)` — use `lang:iw`, not `lang:he` (see mapping table above).
- **ar** (A): `("صفارة الإنذار" OR إنذار OR ملجأ OR "غرفة آمنة" OR إخلاء OR نازحون OR مدارس OR طوارئ OR "قيادة الجبهة الداخلية" OR قصف OR صواريخ OR "تعليم عن بعد")`
- **ru** (A): `(сирена OR тревога OR убежище OR "безопасная комната" OR эвакуация OR "командование тылом" OR школы OR "дистанционное обучение" OR "ракетная тревога" OR обстрел OR "чрезвычайная ситуация")`
- **en** (A, if requested): `("air raid" OR siren OR alarm OR shelter OR "safe room" OR evacuation OR evacuees OR "Home Front Command" OR "remote learning" OR "rocket fire" OR "emergency")`

### Cluster B — psychosocial / vulnerable populations / community

- **he** (B): `(חרדה OR פחד OR "פוסט טראומה" OR PTSD OR "מצב נפשי" OR "תמיכה נפשית" OR טראומה OR חוסן OR פסיכולוג OR קשישים OR ילדים OR נוער OR מוגבלות OR "צרכים מיוחדים" OR קהילה OR התנדבות OR "עזרה הדדית")`
- **ar** (B): `(قلق OR خوف OR "صدمة نفسية" OR "صحة نفسية" OR "دعم نفسي" OR صمود OR مسنون OR أطفال OR "ذوو الاحتياجات الخاصة" OR "نساء حوامل" OR مجتمع OR تطوع)`
- **ru** (B): `(страх OR тревожность OR ПТСР OR "посттравматическое" OR "психологическая помощь" OR "психическое здоровье" OR устойчивость OR пожилые OR дети OR инвалиды OR сообщество OR волонтёры)`
- **en** (B, if requested): `(anxiety OR fear OR PTSD OR trauma OR "mental health" OR resilience OR coping OR psychologist OR elderly OR disabled OR community OR volunteers OR "mutual aid")`

**Locality clause (only if `--north`):**
- **he**: `("קריית שמונה" OR נהריה OR צפת OR מטולה OR שלומי OR חיפה OR "ראש פינה" OR מעלות OR חורפיש OR מרגליות OR יראון OR אביבים OR "קריית ביאליק" OR עכו OR "רמת הגולן" OR "הגליל העליון" OR "הגליל המערבי")` — all multi-word names quoted (unquoted `קריית שמונה` parses inconsistently between counts/recent and search/recent inside an OR-clause). Bare `גליל` and `גולן` removed because they over-match common Hebrew word forms; replaced with quoted phrases.
- **ar**: `(حيفا OR عكا OR "كريات شمونة" OR نهاريا OR صفد OR "كريات بيالك" OR شفاعمرو OR "الجليل الأعلى" OR "الجليل الأسفل" OR طمرة OR سخنين OR "كفر كنا")` — bare `الجليل` and `الجولان` removed (Arabic search uses root-stemming, so `الجليل` matches the adjective "glorious/magnificent" in religious texts and `الجولان` matches `جولة` "round/tour" and Syrian political discourse about displaced Golanis). Quoted phrases anchor to place names; specific Israeli-Arab towns (طمرة, سخنين, كفر كنا) expanded for citizen-voice coverage.
- **ru**: `("Кирьят-Шмона" OR Хайфа OR Нагария OR "Кирьят-Бялик" OR Цфат OR Галилея OR Голаны OR Акко)`
- **en**: `("Kiryat Shmona" OR Haifa OR Naharia OR Acre OR Galilee OR Golan OR Metula)`

If `--north` makes a query exceed 512 chars, **trim cluster terms first** — never the locality clause.

**Before any X spend, print all 6 (or up to 8 with `en`) constructed queries** so the user can sanity-check the vocabulary.

---

## Step 1 — Dry-run cost estimate (ALWAYS runs first)

For each (cluster × language × date) slot, call `counts/recent`. With default `--lang he,ar,ru` that's 2 × 3 × 3 = **18 calls = $0.09 X**. Clamp `end_time` to `now-60s` for today UTC slots.

After each call, append to spend log:
```
{"ts":"...","endpoint":"counts/recent","cluster":"A|B","date":"...","lang":"...","result_count":N,"est_cost_usd":0.005}
```

Aggregate via jq:
```
jq -s '
  map(select(.endpoint=="counts/recent")) as $rows |
  {
    counts_calls: ($rows|length),
    total_counts_cost: ($rows|map(.est_cost_usd)|add),
    by_date: ($rows | group_by(.date) | map({date:.[0].date, total:(map(.result_count)|add)})),
    by_lang: ($rows | group_by(.lang) | map({lang:.[0].lang, total:(map(.result_count)|add)})),
    by_cluster: ($rows | group_by(.cluster) | map({cluster:.[0].cluster, total:(map(.result_count)|add)})),
    grand_total: ($rows|map(.result_count)|add),
    capped_per_call: ($rows | map(if .result_count > '"$MAXPQ"' then '"$MAXPQ"' else .result_count end) | add),
    est_post_cost: (($rows | map(if .result_count > '"$MAXPQ"' then '"$MAXPQ"' else .result_count end) | add) * 0.005)
  }
' "$SPEND_LOG"
```

Projection: `est_total_x = total_counts_cost + est_post_cost` (+ replies term if `--with-replies`).

Abort if `est_total_x > --max-cost-usd`. Otherwise print a compact table (slot rows + totals + projection).

**If `--execute` not passed:** print `Dry-run complete. Spent $<x> on counts/recent. Pass --execute --max-cost-usd <Y> to fetch posts.` and STOP.

---

## Step 2 — Execute fetch (only if `--execute`)

For each (cluster × lang × date) slot where `projected_count > 0`:

```
curl -s -G "https://api.x.com/2/tweets/search/recent" \
  --data "query=$QE" \
  --data "start_time=${DATE}T00:00:00Z" \
  --data "end_time=${END}" \
  --data "max_results=$MAXPQ" \
  --data-urlencode "tweet.fields=created_at,author_id,conversation_id,public_metrics,lang,geo" \
  --data-urlencode "user.fields=description,name,username,location,verified,verified_type,public_metrics" \
  --data-urlencode "expansions=author_id" \
  -H "Authorization: Bearer $X_BEARER_TOKEN" \
  > business_modules/social_media/data/x-raw-full-${DATE}-${LANG}-${CLUSTER}.json
```

Append a `search/recent` spend-log line with `cluster`, `date`, `lang`, `result_count`, `est_cost_usd = N * 0.005`. **No pagination.**

---

## Step 3 — Bash pre-filter + dedupe across clusters

For each `x-raw-full-${DATE}-${LANG}-${CLUSTER}.json`, run the standard citizen-voice rejection filter (drop news handles, business/government verified accounts, accounts with journalist/spokesperson bios). Output the slim fields **plus** a `cluster` field so we can see provenance:

```
jq -c --arg date "$DATE" --arg lang "$LANG" --arg cluster "$CLUSTER" '
  . as $root |
  (.includes.users // []) as $users |
  (.data // [])[] |
  . as $tweet |
  ($users[] | select(.id == $tweet.author_id)) as $u |
  select(
    ($tweet.text | gsub("https?://[^ ]+";"") | gsub("@[A-Za-z0-9_]+";"") | length) >= 12
    and ( ($u.username // "") | test("news|n12|kan|maariv|ynet|walla|mako|jpost|haaretz|globes|calcalist|israelhayom|kikar|srugim|themarker|davar|i24|reshet|reuters|afp|aljazeera"; "i") | not )
    and ( ($u.verified_type // "") | test("business|government"; "i") | not )
    and ( ($u.description // "") | test("journalist|כתב|כתבת|עיתונאי|reporter|correspondent|spokesperson|דובר|דוברת|פיקוד|idf|רשות|משרד|news|editor|anchor|host|presenter"; "i") | not )
  ) |
  {
    tid: $tweet.id, date: $date, lang: $lang, cluster: $cluster, text: $tweet.text,
    created_at: $tweet.created_at, conv: $tweet.conversation_id,
    likes: ($tweet.public_metrics.like_count // 0),
    replies: ($tweet.public_metrics.reply_count // 0),
    quotes: ($tweet.public_metrics.quote_count // 0),
    handle: ($u.username // ""), user_name: ($u.name // ""),
    bio: (($u.description // "") | .[0:140]),
    user_loc: ($u.location // ""),
    followers: ($u.public_metrics.followers_count // 0),
    verified: ($u.verified // false),
    url: ("https://x.com/" + ($u.username // "i") + "/status/" + $tweet.id)
  }
' business_modules/social_media/data/x-raw-full-${DATE}-${LANG}-${CLUSTER}.json \
  >> business_modules/social_media/data/x-candidates-full-${TARGET}.raw.jsonl
```

After all (cluster × lang × date) shards are processed, **dedupe by `tid`** (a post matching cluster A and cluster B should appear once), preferring the cluster with the higher engagement record:
```
jq -s '
  group_by(.tid) | map(
    (sort_by(-(.replies + .likes + .quotes))[0]) as $best |
    $best + {clusters: (map(.cluster) | unique)}
  )
' business_modules/social_media/data/x-candidates-full-${TARGET}.raw.jsonl \
  > business_modules/social_media/data/x-candidates-full-${TARGET}.deduped.json
```

Apply the candidate cap (top by engagement):
```
jq 'sort_by(-(.replies + .likes + .quotes))[0:'"$CAP"']' \
  business_modules/social_media/data/x-candidates-full-${TARGET}.deduped.json \
  > business_modules/social_media/data/x-candidates-full-${TARGET}.top.json

TOTAL=$(jq 'length' business_modules/social_media/data/x-candidates-full-${TARGET}.deduped.json)
KEPT=$(jq 'length' business_modules/social_media/data/x-candidates-full-${TARGET}.top.json)
DROPPED=$((TOTAL - KEPT))
```

Print one line: `Pre-filtered → <TOTAL> unique post candidates → kept top <KEPT> by engagement (<DROPPED> dropped by cap)`. Do NOT `Read` yet.

---

## Step 4 — Claude classification of candidates (slim context)

`Read` only `business_modules/social_media/data/x-candidates-full-<target>.top.json`. Apply this multilingual classifier prompt (adapted from the news-sites pre-filter):

> You are a strict relevance classifier for community resilience behavioral analysis in Israel. For each tweet, decide whether the text describes concrete, observable behavior of the Israeli civilian population under current emergency conditions.
>
> **INCLUDE** if the tweet evidences any of:
> - Specific emergency actions: sheltering, evacuation, school closures/openings, civil-defense compliance
> - Institutional response or failure: hospitals, municipalities, emergency services
> - Civilian mental health: psychological distress, trauma, coping
> - Vulnerable populations under emergency: evacuees, elderly, disabled, special needs with concrete situations
> - Mutual aid, volunteering, community solidarity
> - Economic disruption from the security situation: business closures, workforce impact
> - Policy decisions with immediate civilian behavioral impact
>
> **EXCLUDE** even if Israel-related:
> - Military operations, battlefield reports, weapons, enemy actions
> - Political debate without civilian behavioral impact
> - Diplomatic/strategic/international affairs
> - Lifestyle, sports, entertainment, fashion
> - General health/parenting not tied to the emergency
> - Crime, courts, business news unless tied to civilian emergency response
> - Pure opinion/editorial without behavioral facts
>
> When uncertain, INCLUDE. False positives are caught downstream; false negatives permanently lose evidence.

For each kept tweet, produce a finding using this schema, choosing the most clearly evidenced component:

```json
{
  "id": "x-<tid>",
  "date": "<created_at sliced YYYY-MM-DD>",
  "location": "<best guess from text or user_loc; else 'לא ברור'>",
  "platform": "x",
  "source_kind": "post",
  "url": "<url from candidate>",
  "quote_original": "<text>",
  "quote_language": "he|ar|ru|en",
  "quote_translation_he": "<only if not Hebrew>",
  "speaker_role": "תושב|הורה|בעל עסק|מפונה|אזרח מקומי|לא ברור",
  "behavior_or_emotion": "<short Hebrew phrase>",
  "resilience_component": "narrative|information_communication|lifesaving_behavior|functional_continuity|community_capital|leadership|belonging_solidarity|wellbeing_atrisk",
  "confidence": "גבוהה|בינונית|נמוכה",
  "relevance_reason": "<one Hebrew sentence>",
  "verification_notes": "Fetched via X API v2 search/recent (cluster <X>). Handle @<handle>, followers <followers>, verified <verified>."
}
```

For each rejected tweet, append `{url, reason}` to `rejected_examples` and increment the matching `rejected.<reason>` counter (`news_domain` if missed by heuristic, `official_speaker`, `no_citizen_quote`, `off_topic`).

Group findings by `finding.date`.

---

## Step 5 — Optional replies (only if `--with-replies`)

Top 20 candidates by `reply_count > 0`. For each, fetch `conversation_id:${CONV_ID} -is:retweet` via `search/recent` with `max_results=50`, save to `business_modules/social_media/data/x-raw-replies-full-${CONV_ID}.json`, log the call to the spend log. Then run the same Step 3 jq citizen-rejection pre-filter over each reply file, appending to `x-reply-candidates-full-<target>.jsonl`. Cap Claude-visible reply candidates at **30 across all conversations** (top by like_count). Append the kept ones to the per-date findings groups with `source_kind: "comment"` and `relevance_reason: "תגובה לתשרשור של @<parent_handle>"`.

---

## Step 6 — Write per-day canonical bundles

For each of the 3 dates that has findings, write the canonical bundle so the resilience pipeline picks it up.

**6a.** Compose the new bundle in-context and `Write` it to a TEMP path: `business_modules/social_media/data/signals-social-<date>.new.json`

Use the **validator-required schema** (matching `socialMediaGatherService.createEmptyBundle` shape — see `business_modules/social_media/app/socialMediaGatherService.js`):

```json
{
  "source_type": "social",
  "content_kind": "osint",
  "date": "<date>",
  "window_days": 1,
  "window_start": "<date>",
  "window_end": "<date>",
  "extracted_at": "<now ISO>",
  "languages": ["he","ar","ru"],
  "platforms_searched": ["x"],
  "queries_executed": <number of search/recent calls for this date>,
  "candidate_hits": <unique pre-filtered candidate count for this date>,
  "verified_findings": <count where confidence != "נמוכה">,
  "low_confidence_findings": <count where confidence == "נמוכה">,
  "rejected": {
    "news_domain": <int>,
    "no_citizen_quote": <int>,
    "official_speaker": <int>,
    "not_public_or_login_required": 0,
    "off_topic": <int>
  },
  "access_limitations": [],
  "gather_queries": [
    {"language":"he","cluster":"A","query":"<query he A>"},
    {"language":"he","cluster":"B","query":"<query he B>"},
    {"language":"ar","cluster":"A","query":"<query ar A>"},
    {"language":"ar","cluster":"B","query":"<query ar B>"},
    {"language":"ru","cluster":"A","query":"<query ru A>"},
    {"language":"ru","cluster":"B","query":"<query ru B>"}
  ],
  "findings": [ /* this run's findings */ ],
  "rejected_examples": [ {"url":"...","reason":"..."} ],
  "summary": null,
  "signals": []
}
```

**Important fields**: `source_type:"social"` and `content_kind:"osint"` are required by `validateOsintBundle`. Each finding must have non-empty `quote_original` and `platform`.

**`signals: []`** is intentionally empty — `treat` populates it.

`Write` the JSON to the `.new.json` temp path. Do not re-`Read`.

**6b.** Merge with any pre-existing canonical bundle so this run accumulates with prior same-day runs instead of overwriting them. Other producers may already have written to this canonical path on the same day — re-runs of `/x-3-full` itself, and `/x-3 <topic>` runs which now also merge their findings here. The merge below preserves all prior `findings` (deduped by `id`).

```bash
CANONICAL="business_modules/social_media/data/signals-social-${DATE}.json"
NEW_TEMP="business_modules/social_media/data/signals-social-${DATE}.new.json"
if [ -f "$CANONICAL" ]; then
  jq -s '
    .[0] as $old | .[1] as $new |
    (($old.findings // []) + ($new.findings // []) | unique_by(.id)) as $merged |
    $new + {
      findings: $merged,
      verified_findings: ($merged | map(select((.confidence // "") | tostring | test("נמוכה") | not)) | length),
      low_confidence_findings: ($merged | map(select((.confidence // "") | tostring | test("נמוכה"))) | length),
      languages: ((($old.languages // []) + ($new.languages // [])) | unique),
      platforms_searched: ((($old.platforms_searched // []) + ($new.platforms_searched // [])) | unique),
      queries_executed: (($old.queries_executed // 0) + ($new.queries_executed // 0)),
      candidate_hits: (($old.candidate_hits // 0) + ($new.candidate_hits // 0)),
      gather_queries: ((($old.gather_queries // []) + ($new.gather_queries // [])) | unique_by(.query)),
      rejected: {
        news_domain: (($old.rejected.news_domain // 0) + ($new.rejected.news_domain // 0)),
        no_citizen_quote: (($old.rejected.no_citizen_quote // 0) + ($new.rejected.no_citizen_quote // 0)),
        official_speaker: (($old.rejected.official_speaker // 0) + ($new.rejected.official_speaker // 0)),
        not_public_or_login_required: (($old.rejected.not_public_or_login_required // 0) + ($new.rejected.not_public_or_login_required // 0)),
        off_topic: (($old.rejected.off_topic // 0) + ($new.rejected.off_topic // 0))
      },
      access_limitations: ((($old.access_limitations // []) + ($new.access_limitations // [])) | unique),
      rejected_examples: ((($old.rejected_examples // []) + ($new.rejected_examples // [])) | unique_by(.url))
    }
  ' "$CANONICAL" "$NEW_TEMP" > "${CANONICAL}.merged" && mv "${CANONICAL}.merged" "$CANONICAL"
  rm "$NEW_TEMP"
  echo "Merged into existing canonical bundle: $CANONICAL"
else
  mv "$NEW_TEMP" "$CANONICAL"
  echo "Wrote new canonical bundle: $CANONICAL"
fi
```

The merge dedupes `findings` by `id`, accumulates counters, unions languages/platforms/queries/access_limitations, and dedupes `rejected_examples` by url. `signals: []` is preserved on the merged bundle so `treat` (Step 6c) rebuilds the signal array from the merged findings.

**6c.** Run `treat` to validate the merged canonical bundle, emit `signals[]`, and write the markdown report:
```
node business_modules/social_media/input/socialMediaInput.js treat --date <date>
```

This calls `validateOsintBundle`, `mapFindingsToSignals`, then saves the treated `signals-social-<date>.json` and `social-osint-report-<date>.md`. Do not `Read` the result — trust the CLI exit/output line.

If `treat` fails with validation errors, the bundle has missing/invalid required fields — surface the error to the user.

---

## Step 7 — Final report

Aggregate spend log:
```
jq -s '
  {
    x_total_calls: length,
    x_counts_calls: (map(select(.endpoint=="counts/recent")) | length),
    x_search_calls: (map(select(.endpoint=="search/recent")) | length),
    x_total_cost: (map(.est_cost_usd) | add | . * 100 | round / 100),
    by_endpoint: (group_by(.endpoint) | map({endpoint:.[0].endpoint, calls:length, posts:(map(.result_count)|add), cost:(map(.est_cost_usd)|add)})),
    by_cluster: (map(select(.endpoint=="search/recent")) | group_by(.cluster) | map({cluster:.[0].cluster, posts:(map(.result_count)|add)}))
  }
' business_modules/social_media/data/x-spend-log-full-<target>.jsonl
```

Print:

1. **Mode**: dry-run vs execute, `--north` on/off, langs, max-per-query, candidate-cap.
2. **Constructed queries** (one block per language, both clusters).
3. **X API spend** vs pre-flight projection. Flag if actual > 1.5× projection.
4. **Claude cost note** — which Reads ran (e.g. "Read top100 candidates ≈ 25K tokens").
5. **Per-date counts**: posts fetched / unique candidates / kept by Claude / rejected (by reason).
6. **Cluster contribution**: posts per cluster (A vs B) and overlap (posts that matched both).
7. **8-component distribution** of findings — count per component across all 3 days.
8. **Settlements covered** if `--north`, else top locations mentioned in `findings[].location`.
9. **Paths written:**
   - `business_modules/social_media/data/x-raw-full-<date>-<lang>-<cluster>.json` × up to 18 (only if `--execute`)
   - `business_modules/social_media/data/x-raw-replies-full-<conv>.json` × up to 20 (only if `--with-replies`)
   - `business_modules/social_media/data/x-candidates-full-<target>.raw.jsonl`
   - `business_modules/social_media/data/x-candidates-full-<target>.deduped.json`
   - `business_modules/social_media/data/x-candidates-full-<target>.top.json`
   - `business_modules/social_media/data/signals-social-<date>.json` × up to 3 (canonical, treated)
   - `business_modules/social_media/data/social-osint-report-<date>.md` × up to 3
   - `business_modules/social_media/data/x-spend-log-full-<target>.jsonl`

If `--execute` was not set, print only sections 1, 2, 3, and `Next step: rerun with --execute --max-cost-usd <Y>`.

---

## Safety invariants — DO NOT VIOLATE

- Never call `search/recent` or `search/all` without `--execute`.
- Never paginate beyond one page per (cluster × lang × date) slot.
- Never request `max_results > 100`.
- Never exceed `--candidate-cap` for what Claude classifies.
- Never proceed if the pre-flight X cost estimate exceeds `--max-cost-usd`.
- Never write the `X_BEARER_TOKEN` value to any file, log, or terminal output.
- Refuse to run if the system clock is in the future or the target date is in the future.
- If any curl returns non-2xx, log + abort + print the status code and X's `errors[]` payload.
- Never `Read` any `x-raw-full-*.json` file — jq summaries only.
- Never read the spend log in full — always aggregate via jq.
- Never spawn agents from inside this command.
- Never re-read a file you just wrote.
- `treat` may overwrite an existing canonical bundle. Warn explicitly in the final report if a bundle existed at the canonical path before this run.
