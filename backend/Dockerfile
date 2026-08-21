FROM python:3.11-slim

WORKDIR /app

# psycopg2-binary needs libpq at runtime on slim images
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Most hosts (Railway, Render, Fly.io) inject $PORT at runtime; 8000 is the local fallback.
ENV PORT=8000
EXPOSE 8000
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
