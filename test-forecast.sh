#!/bin/bash
# Test the forecast API against production
URL="https://301-1dol-ai.vercel.app/api/forecast"
TOKEN="evlXdiVN8FY7xav2"

echo "=== Testing Forecast API ==="
echo "URL: $URL"
echo "Token: $TOKEN"
echo ""

echo "--- 1d horizon, 1 iteration ---"
echo ""

RESPONSE=$(curl -s -w "\n---HTTP_CODE:%{http_code}---\n---TIME:%{time_total}s---" \
  -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"guidance\":\"Land MotoGP partnerships and first paying clients\",\"iterations\":1,\"horizons\":[\"1d\"]}")

HTTP_CODE=$(echo "$RESPONSE" | grep -o 'HTTP_CODE:[0-9]*' | cut -d: -f2)
TIME=$(echo "$RESPONSE" | grep -o 'TIME:[0-9.]*s' | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/---HTTP_CODE/d' | sed '/---TIME/d')

echo "HTTP: $HTTP_CODE | Time: $TIME"
echo ""

if echo "$BODY" | python3 -m json.tool > /dev/null 2>&1; then
  echo "✅ Valid JSON"
  echo ""
  
  # Extract key fields
  MSG_COUNT=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('horizons',[{}])[0].get('messages',[])))" 2>/dev/null)
  SCORE=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('horizons',[{}])[0].get('score','?'))" 2>/dev/null)
  MILESTONES=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); ms=d.get('horizons',[{}])[0].get('keyMilestones',[]); print(len(ms),'milestones:', ', '.join(ms[:3]))" 2>/dev/null)
  HORIZON=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('horizons',[{}])[0].get('horizon','?'))" 2>/dev/null)
  
  echo "Horizon: $HORIZON"
  echo "Messages: $MSG_COUNT"
  echo "Score: $SCORE/10"
  echo "$MILESTONES"
  echo ""
  
  # Show first 3 messages
  echo "--- Sample messages ---"
  echo "$BODY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
msgs = d.get('horizons',[{}])[0].get('messages',[])
for m in msgs[:5]:
    author = m.get('author','?')
    ts = m.get('timestamp','')
    content = m.get('content','')[:120]
    role = '🤖' if m.get('role') == 'assistant' else '👤'
    print(f'{role} {author} [{ts}]: {content}')
" 2>/dev/null
  
else
  echo "❌ Invalid JSON or error"
  echo ""
  echo "$BODY" | head -20
fi

echo ""
echo "=== Done ==="
