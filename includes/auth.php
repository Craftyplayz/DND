<?php
// Google sign-in (login only). login.php checks Google's ID token and keeps the account in a PHP session;
// auth_user() reads it, auth_require() limits a page to the ADMIN_EMAILS in config.php.
// Without includes/config.php sign-in is off: no button, nobody signed in, /private/ closed.

// The Table view (ROADMAP 1.7, campaigns/table.php) only reads: a change sent from its tab (?as=table, or a page whose address
// is /campaigns/<id>/table) is refused here, before any endpoint looks at it, even though the DM's own cookie comes with it.
function auth_table_tab()
{
    $from = (string)parse_url((string)($_SERVER['HTTP_REFERER'] ?? ''), PHP_URL_PATH);
    return ($_GET['as'] ?? '') === 'table' || preg_match('#^/campaigns/[A-Za-z0-9_-]+/table/?$#', $from);
}
if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true) && auth_table_tab()) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    exit('{"error":"The Table view can\'t change anything."}');
}

if (is_file(__DIR__ . '/config.php')) require_once __DIR__ . '/config.php';
const AUTH_COOKIE = 'dndsid';
const AUTH_DAYS = 30;
// DND_SESSIONS: a stand-in folder for the local checks in _dev/scripts/, so they never touch real sessions
define('AUTH_SESSIONS', getenv('DND_SESSIONS') ?: __DIR__ . '/../private/sessions');

function auth_enabled()
{
    return defined('GOOGLE_CLIENT_ID') && GOOGLE_CLIENT_ID !== '';
}

// Sessions live in private/sessions/ for AUTH_DAYS: a shared host's default store is often cleared after 24 minutes.
// $write = false reads the session and releases its lock straight away, so a page's requests don't queue behind each other.
function auth_start($write = false)
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    if (!is_dir(AUTH_SESSIONS)) @mkdir(AUTH_SESSIONS, 0700, true);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', (string)(AUTH_DAYS * 86400));
    session_save_path(AUTH_SESSIONS);
    session_name(AUTH_COOKIE);
    session_set_cookie_params(['lifetime' => AUTH_DAYS * 86400, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax']);
    session_start($write ? [] : ['read_and_close' => true]);
}

// ['sub', 'email', 'name'] of the signed-in account, or null. Only touches the session when its cookie is there,
// so signed-out visitors get no cookie and pages cache as before.
function auth_user()
{
    static $user = false;
    if ($user !== false) return $user;
    $user = null;
    if (auth_enabled() && isset($_COOKIE[AUTH_COOKIE])) {
        auth_start();
        $u = isset($_SESSION['user']) ? $_SESSION['user'] : null;
        if (is_array($u) && isset($u['sub'], $u['email']) && preg_match('/^\d{1,40}$/', $u['sub'])) $user = $u;
    }
    return $user;
}

function auth_is_admin($user)
{
    return $user && defined('ADMIN_EMAILS') && in_array(strtolower($user['email']), array_map('strtolower', (array)ADMIN_EMAILS), true);
}

// Checks an ID token with Google's tokeninfo endpoint (it rejects a bad signature or an expired token),
// then the claims themselves. Returns the claims, or null.
function auth_verify($token)
{
    if (!auth_enabled() || !preg_match('/^[\w-]+\.[\w-]+\.[\w-]+$/', $token)) return null;
    $ch = curl_init('https://oauth2.googleapis.com/tokeninfo');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query(['id_token' => $token]), CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $c = $status === 200 && $body ? json_decode($body, true) : null;
    return auth_claims_ok($c, GOOGLE_CLIENT_ID, time()) ? $c : null;
}

// our client ID, Google as issuer, not expired, a verified email (tests: _dev/scripts/auth-claims.test.php)
function auth_claims_ok($c, $clientId, $now)
{
    return is_array($c)
        && ($c['aud'] ?? '') === $clientId
        && in_array($c['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)
        && (int)($c['exp'] ?? 0) > $now
        && in_array($c['email_verified'] ?? '', ['true', true], true)
        && preg_match('/^\d{1,40}$/', (string)($c['sub'] ?? ''))
        && !empty($c['email']);
}

// a path on this site to go back to, or "/"
function auth_back($path)
{
    return is_string($path) && preg_match('#^/(?![/\\\\])[^\s\\\\]*$#', $path) ? $path : '/';
}

// The header / sheet bar widget: Google's button when signed out, the name and Sign out when signed in.
function auth_button()
{
    if (!auth_enabled()) return '';
    $user = auth_user();
    if ($user) {
        $back = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';
        return '<form class="auth" method="post" action="/logout.php"><input type="hidden" name="back" value="' . h($back) . '">'
            . '<span class="auth-name" title="' . h($user['email']) . '">' . h($user['name'] !== '' ? $user['name'] : $user['email']) . '</span>'
            . '<button type="submit">Sign out</button></form>';
    }
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost';
    $scheme = preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $host) ? 'http' : 'https';
    // login.php sends you back to the page in auth_back (Google posts the token from its own page, so there's no useful referrer)
    return '<div class="auth"><div id="g_id_onload" data-client_id="' . h(GOOGLE_CLIENT_ID) . '" data-login_uri="' . h($scheme . '://' . $host . '/login.php') . '" data-ux_mode="popup" data-auto_prompt="false"></div>'
        . '<div class="g_id_signin" data-type="standard" data-size="medium" data-theme="filled_black" data-shape="pill" data-text="signin"></div></div>'
        . '<script>document.cookie = "auth_back=" + encodeURIComponent(location.pathname + location.search) + "; path=/; SameSite=Lax";</script>'
        . '<script src="https://accounts.google.com/gsi/client" async></script>';
}

// Stops the page unless an ADMIN_EMAILS account is signed in: a sign-in page, or "not allowed".
function auth_require()
{
    $user = auth_user();
    if (auth_is_admin($user)) return $user;
    http_response_code($user ? 403 : 401);
    $GLOBALS['site_page'] = ['components' => true, 'title' => $user ? 'Not allowed' : 'Sign in'];
    ?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
    <meta name="robots" content="noindex, nofollow">
</head>

<body>
    <?php site_header(); ?>

    <main class="page" id="main">
        <h1 class="page-title"><?= $user ? 'Not allowed' : 'Sign in' ?></h1>
        <p class="page-lede"><?php if (!auth_enabled()): ?>Sign-in isn't set up on this server yet (includes/config.php).<?php elseif ($user): ?><?= h($user['email']) ?> can't open this page.<?php else: ?>Sign in with Google to open this page.<?php endif; ?></p>
    </main>

    <?php site_footer(null, false); ?>
</body>

</html>
<?php
    exit;
}
