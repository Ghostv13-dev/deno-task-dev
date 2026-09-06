FROM denoland/deno:2.2.0

WORKDIR /app

COPY deno.json .
COPY main.ts .
COPY src ./src
COPY scripts ./scripts

RUN deno cache main.ts

# SQLite database lives here — mount a volume at this path so data
# survives container restarts/redeploys.
VOLUME ["/app/data"]
ENV DB_PATH=/app/data/bot.db

EXPOSE 8000

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--unstable-kv", "--unstable-cron", "main.ts"]
