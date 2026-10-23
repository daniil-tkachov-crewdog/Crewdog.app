// Vulnerability-scanner blocklist.
//
// The traffic log is full of probes for files this app has never served:
// /.git/HEAD, /.env, /wp-login.php and friends. They are automated scanners
// looking for a leaked repository, credentials or an unpatched WordPress.
//
// Blocking them is safe for SEO and for AI discoverability: no search or AI
// crawler (Googlebot, Bingbot, GPTBot, ClaudeBot, PerplexityBot, …) ever
// requests these paths, and nothing here exists to be indexed anyway. Only the
// listed patterns are touched — every real route still falls through to the SPA
// handler untouched.
//
// The visit is still recorded, so these probes keep showing up in the admin
// "Web Traffic" tab; they just get a bare 404 instead of the full HTML page.

// Paths that only a scanner would ask for. Anchored at the start of the path
// so a legitimate route can never be caught by accident.
const BLOCKED_RE = [
  // Version control and CI metadata
  /^\/\.git(\/|$)/i,
  /^\/\.svn(\/|$)/i,
  /^\/\.hg(\/|$)/i,
  /^\/\.github(\/|$)/i,
  /^\/\.circleci(\/|$)/i,

  // Secrets and credentials
  /^\/\.env/i,
  /^\/\.aws(\/|$)/i,
  /^\/\.ssh(\/|$)/i,
  /^\/\.npmrc$/i,
  /^\/\.htaccess$/i,
  /^\/\.htpasswd$/i,
  /^\/\.dockerenv$/i,
  /^\/(docker-compose|Dockerfile)(\.[\w.-]+)?$/i,
  /^\/(config|secrets?|credentials?|backup|dump|db)\.(json|ya?ml|ini|php|sql|bak|old|txt)$/i,
  /^\/(id_rsa|id_dsa|\.?ftpconfig|web\.config)$/i,

  // WordPress / PHP CMS probes — this app is neither
  /^\/wp-/i,
  /^\/wordpress(\/|$)/i,
  /^\/xmlrpc\.php$/i,
  /^\/[\w.-]*\.php\d?$/i,
  /^\/(phpmyadmin|pma|myadmin|phppgadmin|adminer)(\/|$)/i,

  // Framework/dependency directories that should never be public
  /^\/vendor(\/|$)/i,
  /^\/node_modules(\/|$)/i,
  /^\/storage\/logs(\/|$)/i,

  // Common shell / backdoor filenames
  /^\/(shell|cmd|eval|backdoor|c99|r57|alfa|wso)\b/i,

  // Misc. appliance and admin panels this app does not run
  /^\/(cgi-bin|boaform|solr|jenkins|actuator|telescope|debug|_ignition)(\/|$)/i,
  /^\/(owa|autodiscover|ecp)(\/|$)/i,
  /^\/(\.well-known\/)?security\.php$/i,
];

export function isBlockedPath(pathname) {
  return BLOCKED_RE.some((re) => re.test(pathname));
}
