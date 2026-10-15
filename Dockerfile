FROM node:22-alpine AS dependencies
# 托管构建机上 npm 偶尔会遇到 DNS / 连接抖动（报错形如 getaddrinfo EAI_AGAIN），
# 一次抖动整轮打包就失败：把重试次数与重试间隔调大，和 CI 里的设置一致。
# ENV 不跨构建阶段继承，所以下面 production 阶段要再写一遍。
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci

FROM dependencies AS frontend-build
COPY frontend ./frontend
COPY shared ./shared
RUN npm run build

FROM node:22-alpine AS production
# 镜像版本与源码版本（package.json）保持一致：构建时由工作流传入，本地构建默认 dev。
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="Games Online" \
      org.opencontainers.image.description="Self-hosted browser arcade with ROM management, emulator, cloud saves and WebRTC netplay" \
      org.opencontainers.image.source="https://github.com/xiaoxin0125/game-biubiubiu" \
      org.opencontainers.image.version="${APP_VERSION}"
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOADS_DIR=/app/data/uploads \
    BIOS_DIR=/app/data/bios \
    SAVES_DIR=/app/data/saves \
    CORES_DIR=/app/data/cores
# npm 的下载重试设置（理由见文件开头 dependencies 阶段），ENV 不跨阶段继承，这里重写一遍。
ENV NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev --workspaces=false --ignore-scripts \
    && npm cache clean --force

COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node data/bios ./data/bios
COPY --chown=node:node data/cores ./data/cores
COPY --chown=node:node --from=frontend-build /app/frontend/dist ./frontend/dist
RUN mkdir -p /app/data/uploads /app/data/saves \
    && chown -R node:node /app/data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npm", "start"]