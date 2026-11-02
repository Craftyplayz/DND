<?php
// Every dice module here (sets, sounds, extras, ...) with its current version, for choice.js: a saved choice keeps the ?v= its files had
// when it was picked, so without this the Homebrew Sheet would keep loading old cached copies after a file changes.
header('Content-Type: application/json');
header('Cache-Control: no-cache');
$out = [];
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(__DIR__, FilesystemIterator::SKIP_DOTS));
foreach ($it as $f) {
    if ($f->getExtension() !== 'js') continue;
    $out[str_replace('\\', '/', substr($f->getPathname(), strlen(__DIR__) + 1))] = $f->getMTime();
}
echo json_encode($out, JSON_UNESCAPED_SLASHES);
