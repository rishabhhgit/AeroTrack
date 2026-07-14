FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NODE_OPTIONS="--max-old-space-size=1024"
RUN npm run build
RUN cp server.cjs dist/

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
