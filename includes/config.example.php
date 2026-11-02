<?php
// Fill in and save as config.php in the site's host folder on the Docker server (/opt/dnd/live, /opt/dnd/test; see .env.example),
// which the container mounts at /etc/dnd. Locally, save it as includes/config.php (gitignored). Without it, sign-in is off and /private/ is closed.

// Web client ID from Google Cloud Console > APIs & Services > Credentials
const GOOGLE_CLIENT_ID = '000000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com';

// Google accounts allowed into /private/
const ADMIN_EMAILS = ['you@gmail.com'];
