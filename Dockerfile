# dnd.craftyplayz.com: the site on PHP 8.3 + Apache. Built by .github/workflows/image.yml, run by compose.yml.
FROM php:8.3-apache

# curl (D&D Beyond, spells, Google sign-in) and mbstring are built into this image; fail the build if that ever changes
RUN php -m | grep -qx curl && php -m | grep -qx mbstring \
    && a2enmod rewrite headers remoteip
COPY docker/php.ini /usr/local/etc/php/conf.d/dnd.ini
COPY docker/site.conf /etc/apache2/sites-available/000-default.conf

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
