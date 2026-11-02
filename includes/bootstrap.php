<?php
// Load this first on every page. It never prints anything.
// Pages set $site_page before requiring it:
//     $site_page = ['title' => '...', 'description' => '...', 'components' => true, 'ui' => true, 'css' => ['/assets/css/pages/x.css']];

if (!defined('SITE_ROOT')) {
    define('SITE_ROOT', dirname(__DIR__));
    require __DIR__ . '/functions.php';
    require __DIR__ . '/auth.php';
    // the session is read here, before any output, so its headers can still be sent
    auth_user();
}
