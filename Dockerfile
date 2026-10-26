FROM node:22-slim

WORKDIR /srv

# @napi-rs/canvas and sharp ship prebuilt binaries for linux-x64/arm64 glibc.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY fonts/ ./fonts/
# Your own theme art (see themes/README.md): whatever PNGs are in themes/ when you build. The published image has none.
COPY themes/ ./themes/

# Everything else is configured through .env (see .env.example).
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:'+process.env.PORT+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/server.mjs"]
