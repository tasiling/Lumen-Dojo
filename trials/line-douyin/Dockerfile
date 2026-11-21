FROM node:24-alpine
WORKDIR /app
COPY . .
RUN node --test tests/*.test.mjs
ENV NODE_ENV=production PORT=8080 TRIAL_DATA_DIR=/data
CMD ["node","server.mjs"]
