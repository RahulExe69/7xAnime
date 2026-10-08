FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pin the upstream source revision so image builds are reproducible.
ARG MIRURO_API_REF=dfb38a646e28afa5b6f14e4b4d9d542b2bf894df
RUN mkdir -p /app \
    && git -C /app init \
    && git -C /app remote add origin https://github.com/walterwhite-69/Miruro-API.git \
    && git -C /app fetch --depth 1 origin ${MIRURO_API_REF} \
    && git -C /app checkout --detach FETCH_HEAD

WORKDIR /app
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
