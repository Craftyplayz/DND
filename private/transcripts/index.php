<?php
// Imports a D&D session (Discord recorder .md export + .ogg recording) into /games/dnd/transcripts/.
// Lives in /private/ so only the password holder can upload. Files arrive in 4 MB chunks because
// the host's proxy rejects requests near 8 MB (413), well under PHP's own 64 MB limit.
require $_SERVER['DOCUMENT_ROOT'] . '/games/dnd/transcripts/transcripts.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json');
    $fail = function ($msg, $code = 400) {
        http_response_code($code);
        exit(json_encode(['error' => $msg]));
    };
    $id = $_POST['id'] ?? '';
    if (!preg_match('/^[a-f0-9]{16}$/', $id)) $fail('Bad upload id.');
    $tmp = TX_DATA . '/.incoming';
    if (!is_dir($tmp) && !mkdir($tmp, 0755, true)) $fail('Could not create the upload folder.', 500);

    if (($_POST['act'] ?? '') === 'chunk') {
        $kind = ($_POST['kind'] ?? '') === 'md' ? 'md' : 'ogg';
        $f = $_FILES['chunk'] ?? null;
        if (!$f || $f['error'] !== UPLOAD_ERR_OK) $fail('A piece of the file didn\'t arrive. Try again.');
        $ok = file_put_contents("$tmp/$id.$kind", file_get_contents($f['tmp_name']), ($_POST['i'] ?? '') === '0' ? 0 : FILE_APPEND);
        if ($ok === false) $fail('Could not save the upload. The server may be out of space.', 500);
        exit(json_encode(['ok' => true]));
    }

    // finish: check both files, then move them into a new session folder
    foreach (glob("$tmp/*") ?: [] as $old) if (filemtime($old) < time() - 86400) @unlink($old);
    $name = trim((string)($_POST['name'] ?? ''));
    if (!preg_match('/^.{1,100}$/u', $name)) $fail('Give the session a name (up to 100 characters).');
    $md = @file_get_contents("$tmp/$id.md");
    if ($md === false || !tx_messages($md)) $fail('That .md file has no transcript messages in it.');
    $ogg = @fopen("$tmp/$id.ogg", 'rb');
    $magic = $ogg ? fread($ogg, 4) : '';
    if ($ogg) fclose($ogg);
    if ($magic !== 'OggS') $fail('That recording isn\'t an .ogg file.');

    $head = tx_head($md);
    $base = ($head['ts'] ? date('Y-m-d', $head['ts']) . '-' : '') . trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)), '-');
    $base = substr($base, 0, 80) ?: 'session';
    for ($slug = $base, $n = 2; is_dir(TX_DATA . "/$slug"); $n++) $slug = "$base-$n";
    $dir = TX_DATA . "/$slug";
    if (!mkdir($dir, 0755) || !rename("$tmp/$id.md", "$dir/transcript.md") || !rename("$tmp/$id.ogg", "$dir/audio.ogg")) $fail('Could not save the session.', 500);
    file_put_contents("$dir/meta.json", json_encode(['name' => $name, 'imported' => time()]));
    exit(json_encode(['url' => '/games/dnd/transcripts/?s=' . $slug]));
}

$site_page = ['components' => true, 'title' => 'Import a D&D Session'];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
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
        <h1 class="page-title">Import a D&amp;D Session</h1>
        <p class="page-lede">Upload the transcript and its recording together. They appear on <a href="/games/dnd/transcripts/">Session Transcripts</a>.</p>

        <form class="form form-card" id="tx-form">
            <label>Session name <input class="field" name="name" required maxlength="100" placeholder="Edrin's Disappearance"></label>
            <label>Transcript (.md) <input class="field" type="file" name="md" accept=".md,text/markdown" required></label>
            <label>Recording (.ogg) <input class="field" type="file" name="ogg" accept=".ogg,audio/ogg" required></label>
            <div class="progress" hidden><i style="width:0%"></i></div>
            <p class="err" hidden></p>
            <div class="actions"><button class="btn primary">Import session</button></div>
        </form>
    </main>

    <?php site_footer(null, false); ?>

    <script>
        (() => {
            const form = document.getElementById('tx-form');
            const btn = form.querySelector('button');
            const bar = form.querySelector('.progress');
            const err = form.querySelector('.err');
            const CHUNK = 4 * 1024 * 1024;

            // suggest the transcript's own title as the name
            form.md.addEventListener('change', async () => {
                const f = form.md.files[0];
                const m = f && (await f.slice(0, 2048).text()).match(/^#\s+(.+)$/m);
                if (m && !form.elements.name.value) form.elements.name.value = m[1].trim();
            });

            async function post(data) {
                const fd = new FormData();
                for (const k in data) fd.append(k, data[k]);
                const r = await fetch('', { method: 'POST', body: fd });
                const j = await r.json().catch(() => ({ error: 'The server sent back something unexpected (' + r.status + ').' }));
                if (j.error) throw new Error(j.error);
                return j;
            }

            form.addEventListener('submit', async e => {
                e.preventDefault();
                const id = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
                const md = form.md.files[0], ogg = form.ogg.files[0];
                const total = md.size + ogg.size;
                let sent = 0;
                btn.disabled = true;
                err.hidden = true;
                bar.hidden = false;
                try {
                    for (const [kind, file] of [['md', md], ['ogg', ogg]]) {
                        for (let i = 0, pos = 0; pos < file.size || i === 0; i++, pos += CHUNK) {
                            const chunk = file.slice(pos, pos + CHUNK);
                            btn.textContent = 'Uploading ' + Math.floor(sent / total * 100) + '%...';
                            await post({ act: 'chunk', id, kind, i, chunk });
                            sent += chunk.size;
                            bar.firstElementChild.style.width = (sent / total * 100) + '%';
                        }
                    }
                    btn.textContent = 'Importing...';
                    location.href = (await post({ act: 'finish', id, name: form.elements.name.value })).url;
                } catch (x) {
                    err.textContent = x.message;
                    err.hidden = false;
                    bar.hidden = true;
                    btn.disabled = false;
                    btn.textContent = 'Import session';
                }
            });
        })();
    </script>
</body>

</html>
