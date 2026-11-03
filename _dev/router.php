<?php
// Router for the local test server, doing what characters/.htaccess, campaigns/.htaccess and campaigns/join/.htaccess do on Apache:
//   php -S 127.0.0.1:8110 -t . _dev/router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('#^/characters/([A-Za-z0-9_-]+)/?$#', $path, $m) && !file_exists(__DIR__ . '/..' . $path)) {
    $_GET['id'] = $m[1];
    $_SERVER['SCRIPT_NAME'] = '/characters/index.php';
    chdir(__DIR__ . '/../characters');
    require __DIR__ . '/../characters/index.php';
    return true;
}
if (preg_match('#^/campaigns/([A-Za-z0-9_-]+)/?$#', $path, $m) && !file_exists(__DIR__ . '/..' . $path)) {
    $_GET['c'] = $m[1];
    $_SERVER['SCRIPT_NAME'] = '/campaigns/index.php';
    chdir(__DIR__ . '/../campaigns');
    require __DIR__ . '/../campaigns/index.php';
    return true;
}
if (preg_match('#^/campaigns/([A-Za-z0-9_-]+)/map/?$#', $path, $m)) {
    $_GET['c'] = $m[1];
    $_SERVER['SCRIPT_NAME'] = '/campaigns/map.php';
    chdir(__DIR__ . '/../campaigns');
    require __DIR__ . '/../campaigns/map.php';
    return true;
}
if (preg_match('#^/campaigns/join/([a-f0-9]+)/?$#', $path, $m)) {
    $_GET['code'] = $m[1];
    $_SERVER['SCRIPT_NAME'] = '/campaigns/join/index.php';
    chdir(__DIR__ . '/../campaigns/join');
    require __DIR__ . '/../campaigns/join/index.php';
    return true;
}
return false;
