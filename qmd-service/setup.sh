#!/bin/bash
set -e

KNOWLEDGE_DIR="${KNOWLEDGE_DIR:-/data/knowledge}"

echo "==> Creating knowledge directory: $KNOWLEDGE_DIR"
mkdir -p "$KNOWLEDGE_DIR"

echo "==> Setting up QMD collection"
qmd collection add "$KNOWLEDGE_DIR" --name odoai || true

echo "==> Adding context"
qmd context add qmd://odoai "odoai Telegram bot knowledge base — dumps, context summaries, people, tasks" || true

echo "==> Initial index"
qmd update || true

echo "==> Setup complete"
