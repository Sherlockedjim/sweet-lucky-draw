// Public browser configuration only. Never include secret keys in build output.
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
function publicKey(value) {
  if (!value) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { return false; }
}
if (!url || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) || !publicKey(key)) {
  console.error('Deployment stopped: configure VITE_SUPABASE_URL and a Publishable/anon key in GitHub repository Variables. Secret/service-role credentials are rejected.');
  process.exit(1);
}
console.log('Public Supabase configuration validated.');
