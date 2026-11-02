<?php
// Server backups for the Monster Sheet: the player sheet's backup.php, writing to private/dnd/monster-backups/<ip>/<monster name>/<ip>-<version>.json
define('HB_BACKUPS', __DIR__ . '/../../../../private/dnd/monster-backups');
define('HB_UNNAMED', 'Unnamed monster');
require __DIR__ . '/../player/backup.php';
