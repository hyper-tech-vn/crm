FROM twentycrm/twenty@sha256:76933f24d3781a3a90809857217b0cfd70735b0fa79eee4acc76956573810439
ARG SOURCE_COMMIT
LABEL org.opencontainers.image.source="https://github.com/hyper-tech-vn/crm"
LABEL org.opencontainers.image.revision=$SOURCE_COMMIT
COPY --chown=1000:1000 server/ /app/packages/twenty-server/dist/
COPY --chown=1000:1000 front/ /app/packages/twenty-server/dist/front/
