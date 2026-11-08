# No application data, dotenv files, private keys or database credentials enter this image.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG SERRIAN_BUILD_COMMIT
RUN test -n "$SERRIAN_BUILD_COMMIT" && DATABASE_URL=postgresql://inert:unused@127.0.0.1:1/build_only BETTER_AUTH_URL=http://127.0.0.1:1 BETTER_AUTH_SECRET=isolated-build-only-no-runtime-value NEXT_TELEMETRY_DISABLED=1 npm run build && SERRIAN_BUILD_COMMIT="$SERRIAN_BUILD_COMMIT" node ops/stamp-build.mjs

# Obtain the PG18 tools, matching support files and their actual shared libraries.
FROM postgres:18-bookworm AS postgres-tools
RUN mkdir /runtime-libs && ldd /usr/lib/postgresql/18/bin/postgres /usr/lib/postgresql/18/bin/initdb /usr/lib/postgresql/18/bin/pg_ctl /usr/lib/postgresql/18/bin/pg_dump /usr/lib/postgresql/18/bin/pg_restore /usr/lib/postgresql/18/bin/psql | awk '/=> \/.*\(/ {print $3}' | sort -u | while read lib; do case "$lib" in */libc.so.*|*/libm.so.*|*/libpthread.so.*|*/libdl.so.*|*/librt.so.*) ;; *) cp -L "$lib" /runtime-libs/ ;; esac; done

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install --no-install-recommends -y ca-certificates locales git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=postgres-tools /usr/lib/postgresql/18 /usr/lib/postgresql/18
COPY --from=postgres-tools /usr/share/postgresql/18 /usr/share/postgresql/18
COPY --from=postgres-tools /runtime-libs/ /usr/local/lib/
RUN ldconfig
ENV PATH="/usr/lib/postgresql/18/bin:${PATH}" NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
# Image remains public-code only. The service user owns only explicitly mounted data/cache.
USER node
EXPOSE 3000
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/environment.ts", "maintenance"]

# Opt-in CI target: no host DB, Docker daemon socket or external runtime network.
FROM runtime AS recovery-test
ENV SERRIAN_TEST_POSTGRES_BIN=/usr/lib/postgresql/18/bin
WORKDIR /tmp/serrian-recovery
USER root
RUN mkdir -p artifacts && chown -R node:node /tmp/serrian-recovery && ln -s /app/node_modules node_modules && ln -s /app/drizzle drizzle && ln -s /app/src src && ln -s /app/scripts scripts && ln -s /app/ops ops
USER node
ENV SERRIAN_INFRA_TEST_RELEASE=/app
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/environment-disposable.test.ts"]
