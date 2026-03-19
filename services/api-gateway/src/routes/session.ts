import { FastifyInstance } from 'fastify';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:8001';
const COOKIE_NAME = 'labnote_rt';
const IS_PROD = process.env.NODE_ENV === 'production';

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );
}

export async function registerSession(app: FastifyInstance) {
  /**
   * POST /api/auth/session
   * Body: { refreshToken: string }
   * Sets the refresh token as httpOnly cookie and returns ok.
   * Called after login or SSO token exchange.
   */
  app.post('/api/auth/session', async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string };
    if (!refreshToken) {
      return reply.status(400).send({ ok: false, error: 'refreshToken is required' });
    }

    reply.header('Set-Cookie', [
      `${COOKIE_NAME}=${refreshToken}; HttpOnly; ${IS_PROD ? 'Secure; ' : ''}SameSite=Strict; Path=/api/auth/session; Max-Age=28800`,
    ]);

    return reply.send({ ok: true });
  });

  /**
   * POST /api/auth/session/refresh
   * Reads refresh token from httpOnly cookie, calls auth-service to get new tokens.
   * Returns new access token in response body, sets new refresh token in cookie.
   */
  app.post('/api/auth/session/refresh', async (request, reply) => {
    const cookies = parseCookies(request.headers.cookie);
    const refreshToken = cookies[COOKIE_NAME];

    if (!refreshToken) {
      return reply.status(401).send({ ok: false, error: 'No refresh token' });
    }

    // Determine if this is a Keycloak or local refresh token
    const keycloakEnabled = process.env.KEYCLOAK_ENABLED === 'true';

    if (keycloakEnabled) {
      // Keycloak refresh
      const kcUrl = process.env.KEYCLOAK_ISSUER || 'http://keycloak:8080/realms/labnote';
      const tokenUrl = `${kcUrl}/protocol/openid-connect/token`;
      const clientId = process.env.KEYCLOAK_CLIENT_ID || 'labnote-frontend';

      try {
        const res = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
          }).toString(),
        });
        if (!res.ok) {
          // Clear invalid cookie
          reply.header('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; ${IS_PROD ? 'Secure; ' : ''}SameSite=Strict; Path=/api/auth/session; Max-Age=0`);
          return reply.status(401).send({ ok: false, error: 'Refresh token expired' });
        }
        const data = await res.json() as { access_token: string; refresh_token?: string };

        // Set new refresh token cookie if rotated
        if (data.refresh_token) {
          reply.header('Set-Cookie', `${COOKIE_NAME}=${data.refresh_token}; HttpOnly; ${IS_PROD ? 'Secure; ' : ''}SameSite=Strict; Path=/api/auth/session; Max-Age=28800`);
        }

        return reply.send({ ok: true, data: { token: data.access_token } });
      } catch {
        return reply.status(502).send({ ok: false, error: 'Keycloak unreachable' });
      }
    } else {
      // Local JWT refresh — forward to auth-service
      try {
        // Decode refresh token to get userId (no verification needed here, auth-service will verify)
        let userId = '';
        try {
          const parts = refreshToken.split('.');
          if (parts.length >= 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            userId = payload.sub || '';
          }
        } catch { /* ignore */ }

        const res = await fetch(`${AUTH_SERVICE_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
          },
          body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) {
          reply.header('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; ${IS_PROD ? 'Secure; ' : ''}SameSite=Strict; Path=/api/auth/session; Max-Age=0`);
          return reply.status(401).send({ ok: false, error: 'Refresh token expired' });
        }

        const data = await res.json() as { ok: boolean; data?: { token: string; refreshToken?: string } };
        if (!data.ok || !data.data?.token) {
          reply.header('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; ${IS_PROD ? 'Secure; ' : ''}SameSite=Strict; Path=/api/auth/session; Max-Age=0`);
          return reply.status(401).send({ ok: false, error: 'Refresh failed' });
        }

        // Set new refresh token cookie
        if (data.data.refreshToken) {
          reply.header('Set-Cookie', `${COOKIE_NAME}=${data.data.refreshToken}; HttpOnly; ${IS_PROD ? 'Secure; ' : ''}SameSite=Strict; Path=/api/auth/session; Max-Age=28800`);
        }

        return reply.send({ ok: true, data: { token: data.data.token } });
      } catch {
        return reply.status(502).send({ ok: false, error: 'Auth service unreachable' });
      }
    }
  });

  /**
   * DELETE /api/auth/session
   * Clears the refresh token cookie (logout).
   */
  app.delete('/api/auth/session', async (_request, reply) => {
    reply.header('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; ${IS_PROD ? 'Secure; ' : ''}SameSite=Strict; Path=/api/auth/session; Max-Age=0`);
    return reply.send({ ok: true });
  });
}
