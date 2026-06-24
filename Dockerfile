# syntax=docker/dockerfile:1

# ---- Stage 1: build the React SPA ----
FROM node:22-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Python API serving the built SPA ----
FROM python:3.12-slim AS app
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=frontend /frontend/dist ./static

# SQLite file + photos live here; mount a named volume at this path.
ENV REEF_DATA_DIR=/data \
    REEF_STATIC_DIR=/app/static
RUN mkdir -p /data

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
