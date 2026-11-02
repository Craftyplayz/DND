# dnd.craftyplayz.com: the site on PHP 8.3 + Apache, plus the live relay (live/relay.js) on Node next to it.
# Built by .github/workflows/image.yml, run by compose.yml.

# the relay's packages, installed by the same Node that runs it
FROM node:22-bookworm-slim AS relay
WORKDIR /relay
COPY live/package.json live/package-lock.json ./
RUN npm ci --omit=dev

FROM php:8.3-apache
COPY --from=relay /usr/local/bin/node /usr/local/bin/node
COPY --from=relay /relay/node_modules /opt/relay/node_modules
# Node needs libstdc++; fail the build if it can't run
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 && rm -rf /var/lib/apt/lists/* && node --version

# curl (D&D Beyond, spells, Google sign-in) and mbstring are built into this image; fail the build if that ever changes
RUN php -m | grep -qx curl && php -m | grep -qx mbstring \
    && a2enmod rewrite headers remoteip proxy proxy_http proxy_wstunnel
COPY docker/php.ini /usr/local/etc/php/conf.d/dnd.ini
COPY docker/site.conf /etc/apache2/sites-available/000-default.conf
COPY --chmod=755 docker/start.sh /usr/local/bin/dnd-start

COPY --chown=root:root . /var/www/html/
# server-only data lives in volumes (compose.yml); a new volume starts as a copy of these folders, deny files and owner included.
# config.php and .htpasswd come from the host folder mounted read-only at /etc/dnd
RUN cd /var/www/html \
    && mkdir -p private/dnd/backups private/dnd/monster-backups private/dnd/accounts private/sessions transcripts/data characters/cache \
    && chown -R www-data:www-data private/dnd/backups private/dnd/monster-backups private/dnd/accounts private/sessions transcripts/data characters/cache \
    && ln -s /etc/dnd/config.php includes/config.php \
    && ln -s /etc/dnd/.htpasswd private/.htpasswd

# the address the Cloudflare tunnel's requests arrive from: the gateway of the stack network (compose.yml); see docker/site.conf
ENV TRUSTED_PROXY=192.168.232.1
# where the relay listens (docker/site.conf proxies /live/ws there, includes/live.php publishes there)
ENV LIVE_RELAY=127.0.0.1:8090 NODE_PATH=/opt/relay/node_modules
CMD ["dnd-start"]
