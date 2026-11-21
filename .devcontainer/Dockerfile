# syntax=docker/dockerfile:1
FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates build-essential jq procps sudo chromium \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium

RUN echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node

RUN npm install -g @angular/cli

USER node
WORKDIR /workspace
EXPOSE 4200 9876
CMD ["/bin/bash"]
