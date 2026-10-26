interface Env {
  BREVO_API_KEY?: string;
}

interface ContactPayload {
  name: string;
  email: string;
  details: string;
  website?: string;
}

const limits = { name: 100, email: 254, details: 3000, body: 16_384, website: 200 };
const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const suspiciousPattern = /(?:<script|javascript:|data:text\/html|(?:\b(?:select|insert|update|delete|drop|alter|create|truncate|exec|union)\b\s+(?:from|into|table|all)|(?:--|\/\*)))/i;
const submissionWindows = new Map<string, number[]>();

function jsonResponse(status: number, message: string, errors?: Record<string, string>) {
  return new Response(JSON.stringify({ message, ...(errors ? { errors } : {}) }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function clean(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\r/g, '').trim().slice(0, maxLength);
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function isRateLimited(request: Request): boolean {
  const ip = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  const recent = (submissionWindows.get(ip) ?? []).filter((timestamp) => timestamp > windowStart);

  if (recent.length >= 5) {
    submissionWindows.set(ip, recent);
    return true;
  }

  recent.push(now);
  submissionWindows.set(ip, recent);
  return false;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return jsonResponse(415, 'Unsupported content type.');
  }
  if (!isSameOrigin(request)) {
    return jsonResponse(403, 'Request origin is not allowed.');
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > limits.body) {
    return jsonResponse(413, 'Request is too large.');
  }
  if (isRateLimited(request)) {
    return jsonResponse(429, 'Too many requests. Please wait before trying again.');
  }

  let payload: Partial<ContactPayload>;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > limits.body) {
      return jsonResponse(413, 'Request is too large.');
    }
    payload = JSON.parse(body) as Partial<ContactPayload>;
  } catch {
    return jsonResponse(400, 'The request body could not be read.');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonResponse(400, 'Invalid request body.');
  }

  if (clean(payload.website, limits.website)) {
    return jsonResponse(200, 'Thanks. Your request has been received.');
  }

  const unexpectedFields = Object.keys(payload).filter((key) => !['name', 'email', 'details', 'website'].includes(key));
  if (unexpectedFields.length) {
    return jsonResponse(400, 'Invalid request fields.');
  }

  const name = clean(payload.name, limits.name);
  const email = clean(payload.email, limits.email).toLowerCase();
  const details = clean(payload.details, limits.details);
  const errors: Record<string, string> = {};

  if (!name) errors.name = 'Enter your name.';
  if (!email || !emailPattern.test(email)) errors.email = 'Enter a valid work email.';
  if (!details) errors.details = 'Tell us a little about your project.';
  if (suspiciousPattern.test(name) || suspiciousPattern.test(details)) {
    return jsonResponse(400, 'The request contains unsupported content.');
  }

  if (Object.keys(errors).length) {
    return jsonResponse(422, 'Please correct the highlighted fields.', errors);
  }

  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) {
    return jsonResponse(503, 'Email delivery is temporarily unavailable. Please try again later.');
  }

  const textBody = [
    `Name: ${name}`,
    `Email: ${email}`,
    '',
    'Project details:',
    details,
  ].join('\n');

  const htmlBody = [
    `<p><strong>Name:</strong> ${escapeHtml(name)}</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
    '<p><strong>Project details:</strong></p>',
    `<p>${escapeHtml(details).replace(/\n/g, '<br>')}</p>`,
  ].join('');

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Dixply Website', email: 'hello@dixply.com' },
        to: [{ email: 'hello@dixply.com', name: 'Dixply' }],
        replyTo: { email, name },
        subject: 'New website contact inquiry',
        textContent: textBody,
        htmlContent: htmlBody,
      }),
    });

    if (!response.ok) {
      const providerBody = await response.text().catch(() => '');
      let providerCode = 'unknown';

      try {
        const providerError = JSON.parse(providerBody) as { code?: unknown };
        if (typeof providerError.code === 'string' || typeof providerError.code === 'number') {
          providerCode = String(providerError.code).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'unknown';
        }
      } catch {
        providerCode = 'unreadable';
      }

      console.error('Brevo contact delivery failed', {
        status: response.status,
        code: providerCode,
      });

      return jsonResponse(502, 'Your message could not be delivered. Please try again or email hello@dixply.com.');
    }

    return jsonResponse(200, 'Thanks. Your project inquiry has been sent.');
  } catch (error) {
    console.error('Brevo contact request failed', {
      name: error instanceof Error ? error.name.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) : 'UnknownError',
    });
    return jsonResponse(502, 'Your message could not be delivered. Please try again or email hello@dixply.com.');
  }
};

export const onRequest: PagesFunction = async () => jsonResponse(405, 'Method not allowed.');
