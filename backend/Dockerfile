FROM edgeinternal1uhg.optum.com/glb-docker-uhg-loc/uhg-goldenimages/python:3.12-latest-dev

USER root

RUN echo "https://edgeinternal1uhg.optum.com/artifactory/glb-alpine-extras-chainguard-rem" >> /etc/apk/repositories

ENV USER_ID=65535 \
    GROUP_ID=65535 \
    USER_NAME=pduser \
    GROUP_NAME=pdgroup \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN addgroup -g $GROUP_ID $GROUP_NAME && \
    adduser --shell /sbin/nologin --disabled-password \
    --no-create-home --uid $USER_ID --ingroup $GROUP_NAME $USER_NAME

RUN --mount=type=secret,id=jf-user \
    --mount=type=secret,id=jf-token \
    JF_USER="$(cat /run/secrets/jf-user)" && \
    JF_TOKEN="$(cat /run/secrets/jf-token)" && \
    export HTTP_AUTH="basic:edgeinternal1uhg.optum.com:$JF_USER:$JF_TOKEN" && \
    apk add --no-cache build-base wget bash

WORKDIR /app

RUN python -m venv /app/venv
ENV PATH="/app/venv/bin:${PATH}"

COPY backend/requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir -r /app/requirements.txt

# Local .env files are excluded by the root .dockerignore.
COPY backend/ /app/

RUN chown -R $USER_NAME:$GROUP_NAME /app

USER $USER_NAME

# Gateway prefix baked in as the container's own default; local dev overrides
# via backend/.env (API_PREFIX=/api) same as the reference PAS app pattern.
ENV PORT=8000 \
    UVICORN_WORKERS=2 \
    UVICORN_TIMEOUT_KEEP_ALIVE=5 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    API_PREFIX=/pbmcaseinsight/api

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --spider -q http://localhost:8000/pbmcaseinsight/api/health || exit 1

ENTRYPOINT ["uvicorn"]
CMD ["app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
