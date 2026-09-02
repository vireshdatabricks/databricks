FROM edgeinternal1uhg.optum.com/glb-docker-uhg-loc/uhg-goldenimages/node:24-latest-dev AS base

USER root

RUN --mount=type=secret,id=jf-user \
    --mount=type=secret,id=jf-token \
    set -eux; \
    JF_USER="$(cat /run/secrets/jf-user)"; \
    JF_TOKEN="$(cat /run/secrets/jf-token)"; \
    export HTTP_AUTH="basic:edgeinternal1uhg.optum.com:${JF_USER}:${JF_TOKEN}"; \
    if command -v apk >/dev/null 2>&1; then \
        apk update && apk upgrade --no-cache; \
    elif command -v apt-get >/dev/null 2>&1; then \
        apt-get update && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/*; \
    fi

# Pin pnpm to the major version the committed pnpm-lock.yaml (lockfileVersion 9) was generated with.
# Corepack talks to registry.npmjs.org by default, which this build network can't reach;
# point it at the internal Artifactory mirror instead, using the same creds as later steps.
RUN --mount=type=secret,id=jf-user \
    --mount=type=secret,id=jf-token \
    set -eux; \
    export COREPACK_NPM_REGISTRY="https://edgeinternal1uhg.optum.com/artifactory/api/npm/glb-npm-vir"; \
    export COREPACK_NPM_USERNAME="$(cat /run/secrets/jf-user)"; \
    export COREPACK_NPM_TOKEN="$(cat /run/secrets/jf-token)"; \
    export COREPACK_INTEGRITY_KEYS=""; \
    corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Gateway prefix baked at build time; empty locally, /pbmcms in deployed builds.
ARG NEXT_PUBLIC_BASE_PATH=/pbmcms
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
ENV NEXT_IGNORE_INCORRECT_LOCKFILE=1

COPY frontend/package.json frontend/pnpm-lock.yaml /app/

RUN --mount=type=secret,id=jf-user \
    --mount=type=secret,id=jf-token \
    set -eux; \
    JF_USER="$(cat /run/secrets/jf-user)"; \
    JF_TOKEN="$(cat /run/secrets/jf-token)"; \
    echo "registry=https://edgeinternal1uhg.optum.com/artifactory/api/npm/glb-npm-vir/" > /root/.npmrc; \
    echo "//edgeinternal1uhg.optum.com/artifactory/api/npm/glb-npm-vir/:username=${JF_USER}" >> /root/.npmrc; \
    echo "//edgeinternal1uhg.optum.com/artifactory/api/npm/glb-npm-vir/:_authToken=${JF_TOKEN}" >> /root/.npmrc; \
    echo "//centraluhg.jfrog.io/:username=${JF_USER}" >> /root/.npmrc; \
    echo "//centraluhg.jfrog.io/:_authToken=${JF_TOKEN}" >> /root/.npmrc; \
    pnpm install --frozen-lockfile; \
    rm -f /root/.npmrc

COPY frontend/ /app/

RUN pnpm run build && \
    rm -f /app/.npmrc

EXPOSE 3000

# next start reads PORT/HOSTNAME from env; avoids pnpm mangling "--"-forwarded CLI flags.
ENV PORT=3000 \
    HOSTNAME=0.0.0.0

# Base image sets ENTRYPOINT ["node"]; reset so CMD runs pnpm directly.
ENTRYPOINT []
CMD ["pnpm", "run", "start"]
