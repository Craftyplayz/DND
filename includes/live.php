<?php
// The live relay (live/relay.js) from PHP. LIVE_RELAY is where it listens (set in the Dockerfile; empty: no relay, as on a
// plain local server, and pages just load state from PHP). live_publish() never fails a save: the relay only adds speed.

// a player's id in one campaign's live room: never the Google id, and different in every campaign
function live_key($campaignId, $sub)
{
    return substr(hash('sha256', "$campaignId:$sub"), 0, 12);
}

// the address pages open, or '' for none (LIVE_WS: local checks that run the relay on its own port)
function live_ws()
{
    return getenv('LIVE_WS') ?: (getenv('LIVE_RELAY') ? '/live/ws' : '');
}

// send $msg to the campaign's room, or only to $to ("dm" or a list of keys); $members (keys) drops anyone no longer in it
function live_publish($campaignId, $msg, $members = null, $to = null)
{
    $relay = getenv('LIVE_RELAY');
    if (!$relay) return;
    $ch = curl_init("http://$relay/publish");
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT_MS => 300, CURLOPT_TIMEOUT_MS => 1000,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(array_filter(['campaign' => $campaignId, 'msg' => $msg, 'members' => $members, 'to' => $to], fn($v) => $v !== null))]);
    curl_exec($ch);
}
