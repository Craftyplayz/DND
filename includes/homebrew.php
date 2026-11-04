<?php
// Homebrew (ROADMAP 4.6, 5.2): what a player makes in the Compendium. One file per entry, <accounts>/homebrew/<sub>/<id>.json:
//   {"id", "kind", "name", "updated", "acct", "archived"?, ...the kind's own fields}. Players archive, nothing is ever removed: the version a
// save replaces is kept in <accounts>/homebrew/<sub>/history/<id>/<its updated>.json (no screen for it yet; the admin restores by hand).
// "acct" marks whose entry it is (hb_acct), so a browser used by two people never uploads one player's entries to the other's account.
// Sharing: <accounts>/campaigns/<campaign id>/homebrew.json, [{"ref", "sub", "id", "at", "dmonly"?}]. A monster shared "dmonly" only ever reaches that campaign's DM and co-DMs (hb_view). A campaign only links entries; the owner's
// file stays the one copy, so an owner's edit reaches the campaign. A sheet keeps its own copy of what it added, so nothing here can
// change or take away what's on a sheet. Every function takes the accounts folder, so _dev/scripts/homebrew.test.php gets its own.
require_once __DIR__ . '/campaigns.php';

const HB_KINDS = ['rule', 'spell', 'item', 'magic', 'feat', 'monster', 'class', 'subclass', 'race', 'subrace', 'background'];
const HB_MAX = 2 * 1024 * 1024; // only stops a broken client

function hb_ok_id($id)
{
    return is_string($id) && preg_match('/^[a-z0-9]{6,40}$/', $id);
}

// what the browser stores and compares: not the Google id, which stays on the server
function hb_acct($sub)
{
    return substr(hash('sha256', 'homebrew:' . $sub), 0, 16);
}

function hb_get($accounts, $sub, $id)
{
    return hb_ok_id($id) ? ch_json("$accounts/homebrew/$sub/$id.json") : null;
}

function hb_mine($accounts, $sub)
{
    $out = [];
    foreach (glob("$accounts/homebrew/$sub/*.json") ?: [] as $f) if ($e = ch_json($f)) $out[] = $e;
    return $out;
}

// [status, answer]. The newest "updated" wins, as the sheets' cloud saves do.
function hb_save($accounts, $sub, $e)
{
    if (!is_array($e) || !hb_ok_id($e['id'] ?? null) || !in_array($e['kind'] ?? null, HB_KINDS, true) || !is_numeric($e['updated'] ?? null)) return [400, ['error' => "That isn't a homebrew entry."]];
    if (!is_string($e['name'] ?? null) || trim($e['name']) === '') return [400, ['error' => 'Give it a name.']];
    if (isset($e['acct']) && $e['acct'] !== hb_acct($sub)) return [403, ['error' => "That entry belongs to another account."]];
    $e['acct'] = hb_acct($sub);
    $dir = "$accounts/homebrew/$sub";
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) return [500, ['error' => "Couldn't make the account folder."]];
    // one writer at a time per account, so the "newer wins" check and the write can't interleave
    $lock = fopen("$dir/.lock", 'c');
    if (!$lock || !flock($lock, LOCK_EX)) return [500, ['error' => "Couldn't lock the account folder."]];
    $have = hb_get($accounts, $sub, $e['id']);
    if ($have && (float)($have['updated'] ?? 0) > (float)$e['updated']) return [409, ['updated' => (float)$have['updated']]];
    // an entry keeps its kind: favourites, links and shares all point at it
    if ($have && ($have['kind'] ?? null) !== $e['kind']) return [400, ['error' => "An entry can't change kind."]];
    // the copy this save replaces goes to history first, so a failed copy never loses it
    if ($have) {
        $old = "$dir/history/{$e['id']}";
        if ((!is_dir($old) && !@mkdir($old, 0750, true) && !is_dir($old)) || !@copy("$dir/{$e['id']}.json", $old . '/' . (float)($have['updated'] ?? 0) . '.json')) return [500, ['error' => "Couldn't keep the old version."]];
    }
    $tmp = "$dir/.{$e['id']}." . getmypid();
    if (@file_put_contents($tmp, json_encode($e, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) === false || !@rename($tmp, "$dir/{$e['id']}.json")) return [500, ['error' => "Couldn't save it."]];
    return [200, ['updated' => (float)$e['updated']]];
}

function hb_shares($accounts, $cid)
{
    return cp_ok_id($cid) ? (ch_json("$accounts/campaigns/$cid/homebrew.json") ?: []) : [];
}

function hb_put_shares($accounts, $cid, $rows)
{
    $tmp = "$accounts/campaigns/$cid/.homebrew.json." . getmypid();
    return @file_put_contents($tmp, json_encode(array_values($rows), JSON_PRETTY_PRINT)) !== false && @rename($tmp, "$accounts/campaigns/$cid/homebrew.json");
}

// the owner shares their own entry with a campaign they're in, or takes it back
function hb_share($accounts, $sub, $cid, $id, $on, $dmonly = false)
{
    $lock = cp_lock($accounts);
    if (!$lock) return [500, ['error' => "Couldn't lock the campaigns."]];
    $c = cp_get($accounts, $cid);
    if (!$c) return [404, ['error' => 'No such campaign.']];
    if (cp_member($c, $sub) < 0) return [403, ['error' => "You aren't in that campaign."]];
    $e = hb_get($accounts, $sub, $id);
    if (!$e) return [404, ['error' => 'Save the entry to your account first.']];
    $rows = array_values(array_filter(hb_shares($accounts, $cid), fn($r) => !($r['sub'] === $sub && $r['id'] === $id)));
    if ($on) $rows[] = ['ref' => bin2hex(random_bytes(6)), 'sub' => $sub, 'id' => $id, 'at' => time()] + ($dmonly && ($e['kind'] ?? '') === 'monster' ? ['dmonly' => true] : []);
    return hb_put_shares($accounts, $cid, $rows) ? [200, ['shared' => (bool)$on]] : [500, ['error' => "Couldn't save the campaign's list."]];
}

// the DM or a co-DM takes an entry out of their campaign; the owner keeps it
function hb_remove($accounts, $sub, $cid, $ref)
{
    $lock = cp_lock($accounts);
    if (!$lock) return [500, ['error' => "Couldn't lock the campaigns."]];
    $c = cp_get($accounts, $cid);
    if (!$c) return [404, ['error' => 'No such campaign.']];
    if (!cp_is_dm($c, $sub)) return [403, ['error' => 'Only the DM can do that.']];
    $rows = array_values(array_filter(hb_shares($accounts, $cid), fn($r) => $r['ref'] !== $ref));
    return hb_put_shares($accounts, $cid, $rows) ? [200, ['removed' => true]] : [500, ['error' => "Couldn't save the campaign's list."]];
}

// everything one player sees: their own entries (archived too), what their campaigns share with them, which campaigns they could share with.
// Owners are named, never identified: a shared entry carries the owner's name in that campaign and no account id.
function hb_view($accounts, $sub)
{
    $shared = $shares = $dmonly = $camps = [];
    foreach (cp_all($accounts) as $c) {
        if (cp_member($c, $sub) < 0) continue;
        $dm = cp_is_dm($c, $sub);
        $camps[] = ['id' => $c['id'], 'name' => $c['name'] ?? '', 'dm' => $dm];
        foreach (hb_shares($accounts, $c['id']) as $r) {
            if ($r['sub'] === $sub) { $shares[$r['id']][] = $c['id']; if (!empty($r['dmonly'])) $dmonly[$r['id']][] = $c['id']; continue; }
            // this is the one place shared entries leave the server: a DM-only one isn't in a player's answer at all
            if (!empty($r['dmonly']) && !$dm) continue;
            // someone who left the campaign no longer shares with it
            $i = cp_member($c, $r['sub']);
            if ($i < 0) continue;
            $e = hb_get($accounts, $r['sub'], $r['id']);
            if (!$e || !empty($e['archived'])) continue;
            $key = $r['sub'] . '/' . $r['id'];
            unset($e['acct']);
            $shared[$key] ??= $e + ['by' => $c['members'][$i]['name'] ?? '', 'camps' => []];
            $shared[$key]['camps'][] = ['id' => $c['id'], 'name' => $c['name'] ?? '', 'ref' => $r['ref'], 'dm' => $dm, 'dmonly' => !empty($r['dmonly'])];
        }
    }
    return ['acct' => hb_acct($sub), 'mine' => hb_mine($accounts, $sub), 'shared' => array_values($shared), 'shares' => (object)$shares, 'dmonly' => (object)$dmonly, 'camps' => $camps];
}
