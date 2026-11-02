<?php
// Checks the ID token claim rules in includes/auth.php.   usage: php _dev/scripts/auth-claims.test.php
require __DIR__ . '/../../includes/auth.php';
$id = 'abc.apps.googleusercontent.com';
$now = 1800000000;
$good = ['aud' => $id, 'iss' => 'https://accounts.google.com', 'exp' => (string)($now + 60), 'email_verified' => 'true', 'sub' => '1234567890', 'email' => 'a@b.c'];
$cases = [
    'a good token passes' => [$good, true],
    'iss without https passes' => [['iss' => 'accounts.google.com'] + $good, true],
    'another app\'s token fails' => [['aud' => 'other.apps.googleusercontent.com'] + $good, false],
    'another issuer fails' => [['iss' => 'https://evil.example'] + $good, false],
    'an expired token fails' => [['exp' => (string)$now] + $good, false],
    'an unverified email fails' => [['email_verified' => 'false'] + $good, false],
    'a missing email_verified fails' => [array_diff_key($good, ['email_verified' => 1]), false],
    'a non-numeric sub fails' => [['sub' => '../x'] + $good, false],
    'no claims fail' => [null, false],
];
$bad = 0;
foreach ($cases as $name => [$claims, $want]) {
    if ((bool)auth_claims_ok($claims, $id, $now) !== $want) { echo "FAIL: $name\n"; $bad++; }
}
foreach (['/', '/sheets/player-dev/?x=1'] as $p) if (auth_back($p) !== $p) { echo "FAIL: auth_back keeps $p\n"; $bad++; }
foreach (['//evil.example', '/\\evil.example', 'https://evil.example', '/a b', null] as $p) if (auth_back($p) !== '/') { echo "FAIL: auth_back rejects " . var_export($p, true) . "\n"; $bad++; }
echo $bad ? "$bad failed\n" : "auth claims ok\n";
exit($bad ? 1 : 0);
