FROM node:18-alpine

WORKDIR /app

COPY graphql-gateway/package*.json ./
RUN npm install --legacy-peer-deps
COPY graphql-gateway .
RUN npm run build
EXPOSE 4000
CMD ["node", "dist/server.js"]
