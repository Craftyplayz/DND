<?php
// Checks the archived session recordings (ROADMAP 1.9): the viewer still finds the volume's folder and seeks in the audio.
//   php _dev/scripts/transcripts-archive.test.php
require __DIR__ . '/../../private/archive/transcripts/transcripts.php';
$bad = 0;
$is = function ($name, $got, $want) use (&$bad) { if ($got !== $want) { echo "FAIL: $name: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; $bad++; } };
$root = realpath(__DIR__ . '/../..');
$is('the sessions stay in the volume\'s folder', realpath(TX_DATA), realpath("$root/transcripts/data"));
foreach (['transcripts/index.php', 'transcripts/transcripts.php', 'private/transcripts/index.php'] as $f) $is("$f has moved out", is_file("$root/$f"), false);
$is('nothing asked: all of it', tx_range('', 100), null);
$is('from a byte', tx_range('bytes=10-', 100), [10, 99]);
$is('a range', tx_range('bytes=10-19', 100), [10, 19]);
$is('a range past the end stops at the end', tx_range('bytes=90-500', 100), [90, 99]);
$is('the last bytes', tx_range('bytes=-10', 100), [90, 99]);
$is('more last bytes than there are', tx_range('bytes=-500', 100), [0, 99]);
$is('starting past the end: all of it', tx_range('bytes=100-', 100), null);
$is('nonsense: all of it', tx_range('bytes=a-b', 100), null);
$is('no numbers: all of it', tx_range('bytes=-', 100), null);
$is('an empty file', tx_range('bytes=0-', 0), null);
$is('a slug can\'t climb out', tx_slug_ok('../secret'), false);
echo $bad ? "$bad failed\n" : "transcripts archive ok\n";
exit($bad ? 1 : 0);
