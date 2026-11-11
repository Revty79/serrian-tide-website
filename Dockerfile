# No application data, dotenv files, private keys or database credentials enter this image.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG SERRIAN_BUILD_COMMIT
ARG SERRIAN_BUILD_HEAP_MIB=3328
ARG SERRIAN_BUILD_CPUS=1
RUN SERRIAN_BUILD_COMMIT="$SERRIAN_BUILD_COMMIT" SERRIAN_BUILD_HEAP_MIB="$SERRIAN_BUILD_HEAP_MIB" SERRIAN_BUILD_CPUS="$SERRIAN_BUILD_CPUS" node ops/build-website.mjs

# Obtain the PG18 tools, matching support files and their actual shared libraries.
FROM postgres:18-bookworm AS postgres-tools
RUN mkdir /runtime-libs && ldd /usr/lib/postgresql/18/bin/postgres /usr/lib/postgresql/18/bin/initdb /usr/lib/postgresql/18/bin/pg_ctl /usr/lib/postgresql/18/bin/pg_dump /usr/lib/postgresql/18/bin/pg_restore /usr/lib/postgresql/18/bin/psql | awk '/=> \/.*\(/ {print $3}' | sort -u | while read lib; do case "$lib" in */libc.so.*|*/libm.so.*|*/libpthread.so.*|*/libdl.so.*|*/librt.so.*) ;; *) cp -L "$lib" /runtime-libs/ ;; esac; done

FROM node:22-bookworm-slim AS runtime
ARG SERRIAN_BUILD_COMMIT
LABEL org.opencontainers.image.revision="$SERRIAN_BUILD_COMMIT" org.serriantide.mode="website" org.opencontainers.image.source="https://github.com/Revty79/serrian-tide-website"
RUN apt-get update && apt-get install --no-install-recommends -y ca-certificates locales git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=postgres-tools /usr/lib/postgresql/18 /usr/lib/postgresql/18
COPY --from=postgres-tools /usr/share/postgresql /usr/share/postgresql
COPY --from=postgres-tools /runtime-libs/ /usr/local/lib/
RUN ldconfig && /usr/lib/postgresql/18/bin/pg_dump --version && /usr/lib/postgresql/18/bin/pg_restore --version && /usr/lib/postgresql/18/bin/psql --version
ENV PATH="/usr/lib/postgresql/18/bin:${PATH}" NEXT_TELEMETRY_DISABLED=1 SERRIAN_RELEASE_COMMIT="$SERRIAN_BUILD_COMMIT" NODE_ENV=production
COPY --from=build /app /app
# Image remains public-code only. The service user owns only explicitly mounted data/cache.
USER node
EXPOSE 3000
CMD ["node", "ops/website-start.mjs"]

# Deliberate operator mode, never the normal website default.
FROM runtime AS maintenance
LABEL org.serriantide.mode="maintenance"
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/environment.ts", "maintenance"]

# Opt-in CI target: no host DB, Docker daemon socket or external runtime network.
FROM runtime AS recovery-test
LABEL org.serriantide.mode="recovery-test"
ENV SERRIAN_TEST_POSTGRES_BIN=/usr/lib/postgresql/18/bin
WORKDIR /tmp/serrian-recovery
USER root
RUN install -d -o node -g node -m 0700 /var/run/postgresql && printf '\njit = off\n' >> /usr/share/postgresql/postgresql.conf.sample && mkdir -p artifacts && chown -R node:node /tmp/serrian-recovery && ln -s /app/node_modules node_modules && ln -s /app/drizzle drizzle && ln -s /app/src src && ln -s /app/scripts scripts && ln -s /app/ops ops && ln -s /app/tsconfig.json tsconfig.json
USER node
ENV SERRIAN_INFRA_TEST_RELEASE=/app
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/environment-disposable.test.ts"]

# Keep the final/default target an actual website, not the opt-in recovery test.
FROM runtime AS website
