<?php
// Cloud saves for the test sheet: the player sheet's cloud.php, writing to private/dnd/accounts/dev/<google sub>/ so that
// characters on the test copy never sync into the live sheet (a newer test sheet may keep fields the live one would drop).
define('CL_ACCOUNTS', __DIR__ . '/../../private/dnd/accounts/dev');
require __DIR__ . '/../player/cloud.php';
