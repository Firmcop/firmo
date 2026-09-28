FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/engines packages/engines
COPY apps/api apps/api
RUN npm install --workspaces --include-workspace-root
RUN npx -w @firmplant/api prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/engines/dist packages/engines/dist
COPY --from=build /app/packages/engines/package.json packages/engines/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/package.json apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
