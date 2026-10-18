FROM oven/bun@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
COPY vendor ./vendor
RUN bun install --frozen-lockfile --ignore-scripts
COPY src ./src
COPY ui ./ui
COPY scripts ./scripts
RUN bun run build
FROM oven/bun@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4
LABEL org.opencontainers.image.source="https://github.com/spitzli/webdock-extension-control-interface"
WORKDIR /app
COPY package.json bun.lock ./
COPY vendor ./vendor
RUN bun install --production --frozen-lockfile --ignore-scripts
COPY --from=build /app/src ./src
COPY --from=build /app/ui/index.html ./ui/index.html
COPY --from=build /app/ui/styles.css ./ui/styles.css
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
USER bun
EXPOSE 3443 3444
CMD ["bun","src/index.ts"]
