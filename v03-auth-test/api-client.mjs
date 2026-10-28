/** Unit 1-B専用の認証APIへの最小限の通信。 */
export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function createAuthApi({ baseUrl, fetcher = fetch }) {
  const root = new URL(baseUrl);
  if (root.pathname !== '/' || root.search || root.hash || root.username || root.password ||
    !(root.protocol === 'https:' || (root.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(root.hostname)))) {
    throw new Error('INVALID_WORKER_ORIGIN');
  }

  async function post(path, token, input = null) {
    if (!/^[-\w.]+\.[-\w.]+\.[-\w.]+$/.test(token || '')) {
      throw new ApiError(401, 'TOKEN_REQUIRED');
    }
    let response;
    try {
      response = await fetcher(new URL(path, root).href, {
        method: 'POST', mode: 'cors', cache: 'no-store', credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(input === null ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(input === null ? {} : { body: JSON.stringify(input) }),
      });
    } catch { throw new ApiError(0, 'NETWORK_ERROR'); }
    let body;
    try { body = await response.json(); }
    catch { throw new ApiError(502, 'INVALID_WORKER_RESPONSE'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError(502, 'INVALID_WORKER_RESPONSE');
    }
    if (!response.ok || body.ok !== true) {
      throw new ApiError(response.status, typeof body.code === 'string' ? body.code : 'API_FAILED');
    }
    return body;
  }

  return {
    verify: token => post('/api/auth/verify', token),
    status: (token, classId) => post('/api/auth/status', token, { class_id: classId }),
    enroll: (token, classId, code) => post('/api/auth/enroll', token,
      { class_id: classId, code }),
  };
}
