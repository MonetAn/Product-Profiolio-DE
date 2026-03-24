import * as jose from 'npm:jose@5.9.6';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export async function getGoogleSheetsAccessToken(serviceAccountJson: string): Promise<string> {
  let creds: { client_email: string; private_key: string };
  try {
    creds = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string };
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON');
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error('Service account JSON must include client_email and private_key');
  }

  const pem = creds.private_key.includes('\\n')
    ? creds.private_key.replace(/\\n/g, '\n')
    : creds.private_key;

  const key = await jose.importPKCS8(pem, 'RS256');

  const jwt = await new jose.SignJWT({ scope: SHEETS_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(creds.client_email)
    .setSubject(creds.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('3600s')
    .sign(key);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google OAuth token error ${res.status}: ${text.slice(0, 500)}`);
  }

  const tokenJson = JSON.parse(text) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error('Google token response missing access_token');
  }
  return tokenJson.access_token;
}
