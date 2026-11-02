<?php
// Signs out (POST only, so a link elsewhere can't do it) and goes back to the page you were on.
require __DIR__ . '/includes/auth.php';

$back = auth_back($_POST['back'] ?? '/');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && isset($_COOKIE[AUTH_COOKIE])) {
    auth_start(true);
    $_SESSION = [];
    session_destroy();
    setcookie(AUTH_COOKIE, '', ['expires' => 1, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
}
header('Cache-Control: no-store');
header('Location: ' . $back, true, 303);
