<?php
// Google Identity Services posts here after "Sign in with Google": credential (an ID token) and g_csrf_token,
// which must match the g_csrf_token cookie it set on this site. A good token signs you in; then back to the page you were on.
require __DIR__ . '/includes/auth.php';

function login_fail($code, $msg)
{
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    exit("Couldn't sign you in: $msg");
}

$back = auth_back(isset($_COOKIE['auth_back']) ? $_COOKIE['auth_back'] : '/');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Location: ' . $back, true, 303);
    exit;
}
if (!auth_enabled()) login_fail(503, "sign-in isn't set up on this server.");
$csrf = isset($_COOKIE['g_csrf_token']) ? (string)$_COOKIE['g_csrf_token'] : '';
if ($csrf === '' || !hash_equals($csrf, (string)($_POST['g_csrf_token'] ?? ''))) login_fail(400, 'the request did not come from the sign-in button. Go back and try again.');
$c = auth_verify((string)($_POST['credential'] ?? ''));
if (!$c) login_fail(401, 'Google did not confirm that account. Go back and try again.');

auth_start(true);
session_regenerate_id(true);
$_SESSION['user'] = ['sub' => (string)$c['sub'], 'email' => (string)$c['email'], 'name' => (string)($c['name'] ?? '')];
session_write_close();
setcookie('auth_back', '', ['expires' => 1, 'path' => '/', 'samesite' => 'Lax']);
header('Cache-Control: no-store');
header('Location: ' . $back, true, 303);
