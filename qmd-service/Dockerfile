FROM node:22-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    python3 \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @tobilu/qmd

WORKDIR /app
COPY package.json .
RUN npm install --production

COPY server.js .
COPY setup.sh .

ENV KNOWLEDGE_DIR=/data/knowledge
ENV PORT=8181

RUN mkdir -p /data/knowledge

EXPOSE 8181

CMD ["sh", "-c", "./setup.sh && node --max-old-space-size=512 server.js"]
