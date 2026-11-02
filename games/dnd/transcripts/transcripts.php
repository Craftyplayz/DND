<?php
// Session transcripts: shared by the viewer (this folder) and the uploader (/private/transcripts/).
// Each session is a folder in data/: transcript.md (Discord recorder export), audio.ogg, meta.json {"name"}.
const TX_DATA = __DIR__ . '/data';

// seconds since midnight for "04:22:53 AM", or null
function tx_secs($time)
{
    if (!preg_match('/(\d{1,2}):(\d{2}):(\d{2})\s*([AP])M/i', $time, $m)) return null;
    return ((int)$m[1] % 12 + (strtoupper($m[4]) === 'P' ? 12 : 0)) * 3600 + (int)$m[2] * 60 + (int)$m[3];
}

// "- **Date**: ..." style fields from the export's header
function tx_field($md, $name)
{
    return preg_match('/\*\*' . preg_quote($name, '/') . '\*\*[:\s]+(.+)/i', $md, $m) ? trim($m[1]) : '';
}

// ['title', 'ts', 'duration', 'speakers', 'messages'] from the top of an export
function tx_head($md)
{
    $date = tx_field($md, 'Date');
    $ts = $date ? strtotime(str_replace(' at ', ' ', $date)) : false;
    return [
        'title' => preg_match('/^#\s+(.+)$/m', $md, $m) ? trim($m[1]) : '',
        'ts' => $ts ?: 0,
        'start' => tx_secs($date),
        'duration' => tx_field($md, 'Duration'),
        'messages' => (int)tx_field($md, 'Total Messages'),
    ];
}

// Messages as [speaker, time, t, text], t = seconds into the recording (recordings may run past midnight).
function tx_messages($md, $start = null)
{
    $out = [];
    $cur = null;
    foreach (preg_split('/\R/', $md) as $line) {
        if (preg_match('/^\*\*(.+?)\*\*\s+-\s+(\d{1,2}:\d{2}:\d{2}\s*[AP]M)\s*$/i', $line, $m)) {
            if ($cur) $out[] = $cur;
            $s = tx_secs($m[2]);
            if ($start === null) $start = $s;
            $cur = ['speaker' => $m[1], 'time' => $m[2], 't' => ($s - $start + 86400) % 86400, 'text' => ''];
        } elseif ($cur && preg_match('/^(##|\*[^*].*\*\s*$)/', $line)) { // a heading, or an italic event ("is present", "ended the recording")
            $out[] = $cur;
            $cur = null;
        } elseif ($cur && trim($line) !== '') {
            $cur['text'] .= ($cur['text'] === '' ? '' : ' ') . trim($line);
        }
    }
    if ($cur) $out[] = $cur;
    return $out;
}

// text between "## Summary" and the next heading
function tx_summary($md)
{
    return preg_match('/^## Summary\s*$(.+?)^##/ms', $md, $m) ? trim($m[1]) : '';
}

function tx_slug_ok($slug)
{
    return is_string($slug) && preg_match('/^[a-z0-9-]{1,100}$/', $slug) && is_file(TX_DATA . "/$slug/transcript.md");
}

// one session's details, cheap enough for the list (reads only the header)
function tx_session($slug)
{
    $dir = TX_DATA . "/$slug";
    $head = tx_head((string)file_get_contents("$dir/transcript.md", false, null, 0, 8192));
    $meta = is_file("$dir/meta.json") ? json_decode((string)file_get_contents("$dir/meta.json"), true) : [];
    return $head + [
        'slug' => $slug,
        'name' => ($meta['name'] ?? '') ?: ($head['title'] ?: $slug),
        'audio' => is_file("$dir/audio.ogg"),
    ];
}

// newest first
function tx_sessions()
{
    $list = [];
    foreach (glob(TX_DATA . '/*/transcript.md') ?: [] as $f) $list[] = tx_session(basename(dirname($f)));
    usort($list, fn($a, $b) => $b['ts'] <=> $a['ts']);
    return $list;
}

// "269m 46s" -> "4 h 30 min"
function tx_duration($d)
{
    if (!preg_match('/(\d+)m/', $d, $m)) return $d;
    $min = (int)$m[1] + (preg_match('/(\d+)s/', $d, $s) && $s[1] >= 30 ? 1 : 0);
    return $min >= 60 ? intdiv($min, 60) . ' h ' . ($min % 60) . ' min' : "$min min";
}

function tx_clock($t)
{
    return sprintf('%d:%02d:%02d', intdiv($t, 3600), intdiv($t % 3600, 60), $t % 60);
}
