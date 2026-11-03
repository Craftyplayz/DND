<?php
$site_page = [
    'title' => 'Privacy',
    'description' => 'What dnd.craftyplayz.com keeps about you, where, and how to have it deleted',
    'components' => true,
];
require $_SERVER['DOCUMENT_ROOT'] . '/includes/bootstrap.php';
?>
<!DOCTYPE html>
<html lang="en">

<head>
    <?php page_head(); ?>
</head>

<body>
    <?php site_header(); ?>

    <main class="page" id="main">
        <?= site_breadcrumbs(site_current_path()) ?>
        <h1 class="page-title">Privacy</h1>
        <p class="page-lede">This site is run by one person for a small group of friends playing D&amp;D. It isn't a company. This page says what the site keeps about you and how to have it deleted. Last updated 2 November 2026.</p>
        <?php // the cards have no margin of their own, and a narrower column reads better ?>
        <div style="display: grid; gap: 12px; max-width: 820px">

        <section class="card">
            <h2>Signing in with Google (optional)</h2>
            <p>You can use the whole site without signing in. If you do sign in, the site gets your Google account ID, email address and name from Google. They're kept in a session file on the server, and your browser gets a cookie called <code>dndsid</code> that only holds a random session ID. Both last up to 30 days, or until you sign out. A short cookie called <code>auth_back</code> remembers which page to send you back to after signing in.</p>
            <p>This is used only to sign you in and save your characters to your account. The site never sees or stores your Google password. Only the site owner's email can open the admin pages under /private/.</p>
        </section>

        <section class="card">
            <h2>Characters saved to your account</h2>
            <p>When you're signed in, characters you save to your account are stored on the server in a folder named after your Google account ID, so you can open them on another device. Homebrew you make in the Compendium is stored the same way. If you share an entry with a campaign, that campaign's members can read it and see your name on it.</p>
        </section>

        <section class="card">
            <h2>Character sheet backups</h2>
            <p>Every edit on the Homebrew Sheet and the Monster Sheet is also saved on the server as a new version, whether you're signed in or not. The versions are filed under your IP address and the character's name, and kept until deleted, so a lost character can be restored. Only the site owner can see them.</p>
        </section>

        <section class="card">
            <h2>Saved in your browser</h2>
            <p>The sheets and dice pages save your characters, monsters, dice choices, presets and sound settings in your browser's local storage. That stays on your device: clearing your browser's site data removes it.</p>
        </section>

        <section class="card">
            <h2>Session recordings</h2>
            <p>The <a href="/transcripts/">Session Transcripts</a> pages hold audio recordings and transcripts of our game sessions, so they include players' voices and names. Anyone who visits the site can open them. If you'd like a recording, a part of one, or your name removed, email me and I'll take it down.</p>
        </section>

        <section class="card">
            <h2>Other services</h2>
            <p>Some pages load from or call these services, which have their own privacy policies:</p>
            <ul>
                <li><a href="https://policies.google.com/privacy">Google</a>: the sign-in button, and checking your sign-in.</li>
                <li><a href="https://www.dndbeyond.com/privacy-policy">D&amp;D Beyond</a>: public character data, fetched by this server and cached on it. Character portraits load straight from D&amp;D Beyond.</li>
                <li><a href="https://www.dnd5eapi.co/">dnd5eapi.co</a> and <a href="https://open5e.com/">Open5e</a>: spell and monster data, fetched by this server.</li>
                <li><a href="https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net">jsDelivr</a> (cdn.jsdelivr.net): the 3D dice code (three.js and cannon-es).</li>
            </ul>
            <p>The services fetched by this server don't see you. The ones your browser loads from directly (Google, D&amp;D Beyond portraits, jsDelivr) see your IP address, like any website.</p>
        </section>

        <section class="card">
            <h2>What the site doesn't do</h2>
            <p>No analytics, no ads, no tracking. Nothing is sold or shared with anyone.</p>
        </section>

        <section class="card">
            <h2>Deleting your data</h2>
            <p>Email <a href="mailto:craftyplayzmcyt@gmail.com">craftyplayzmcyt@gmail.com</a> and I'll delete your account folder, your sheet backups, and anything from the recordings you ask about.</p>
        </section>
        </div>
    </main>

    <?php site_footer(null, false); ?>
</body>

</html>
