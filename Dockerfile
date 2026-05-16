FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git openssh-client bash \
  && rm -rf /var/lib/apt/lists/* \
  && bash -c "$(curl -fsSL https://raw.githubusercontent.com/brevdev/brev-cli/main/bin/install-latest.sh)"

ENV PATH="/root/.local/bin:${PATH}"

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0

CMD ["bash", "scripts/railway/start-clawforge.sh"]
