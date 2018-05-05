FROM node:8-alpine

WORKDIR /app
COPY . /app

RUN apk add --no-cache --virtual git && \
    npm install && \
    chown -R node:node . && \
    npm cache clean --force

USER node

EXPOSE 8084

CMD ["npm","start"]
