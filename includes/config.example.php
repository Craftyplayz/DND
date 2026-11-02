<?php
// Copy to includes/config.php and fill in. config.php is gitignored and deploy.sh never uploads or deletes it,
// so put it on the server by hand. Without it, sign-in is switched off and /private/ is closed to everyone.

// Web client ID from Google Cloud Console > APIs & Services > Credentials
const GOOGLE_CLIENT_ID = '000000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com';

// Google accounts allowed into /private/
const ADMIN_EMAILS = ['you@gmail.com'];
