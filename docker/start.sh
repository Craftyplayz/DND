#!/bin/sh
# The container's start: the live relay (live/relay.js) as www-data, started again if it ever stops, next to Apache.
# Its log lines go to the container log with Apache's.
(
    while true; do
        su -s /bin/sh www-data -c 'node /var/www/html/live/relay.js'
        echo "live relay stopped; starting it again in 2 s" >&2
        sleep 2
    done
) &
exec apache2-foreground
