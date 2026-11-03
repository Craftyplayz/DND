<?php
// Server backups for the Monster Sheet: the player sheet's backup.php, writing to private/dnd/monster-backups/<ip>/<monster name>/<ip>-<version>.json
// DND_MONSTER_BACKUPS moves it elsewhere (the local checks give each server its own folder)
define('HB_BACKUPS', getenv('DND_MONSTER_BACKUPS') ?: __DIR__ . '/../../private/dnd/monster-backups');
define('HB_UNNAMED', 'Unnamed monster');
define('HB_ENCS', true); // ?encs backs up the encounter list (ROADMAP 3.1) as <ip>/encounters-<version>.json

require __DIR__ . '/../player/backup.php';
