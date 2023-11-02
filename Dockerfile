# ---- Base Node ----
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/ 

# ---- Dependencies ----
FROM base AS dependencies
RUN npm ci && npx prisma generate

# ---- Build ----
FROM dependencies AS build
COPY . .
RUN npm run build

# ---- Production ----
FROM node:20-alpine AS production
ARG UID=${UID:-1001}

# Add non-root user app, with home directory /app and uid
RUN adduser -D -u ${UID} app \
  && mkdir -p /app \
  && chown -R app /app

WORKDIR /app
COPY --chown=app:app --from=dependencies /app/node_modules ./node_modules
COPY --chown=app:app --from=build /app/.next ./.next
COPY --chown=app:app --from=build /app/public ./public
COPY --chown=app:app --from=build /app/package*.json ./
COPY --chown=app:app --from=build /app/next.config.js ./next.config.js
COPY --chown=app:app --from=build /app/prisma ./prisma
# COPY --chown=app:app --from=build /app/next-i18next.config.js ./next-i18next.config.js

# Drop privileges
USER app

# Expose the port the app will run on
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
