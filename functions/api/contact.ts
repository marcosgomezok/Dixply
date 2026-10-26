interface Env {
  BREVO_API_KEY?: string;
}

interface ContactPayload {
  name: string;
  email: string;
  details: string;
  website?: string;
}

const limits = { name: 100, email: 254, details: 3000 };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(status: number, message: string, errors?: Record<string, string>) {
  return new Response(JSON.stringify({ message, ...(errors ? { errors } : {}) }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function clean(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/\u0000/g, '').replace(/\r/g, '').trim().slice(0, maxLength)
    : '';
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

  let payload: Partial<ContactPayload>;
  try {
    payload = await request.json() as Partial<ContactPayload>;
  } catch {
    return jsonResponse(400, 'The request body could not be read.');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonResponse(400, 'Invalid request body.');
  }

  if (clean(payload.website, 200)) {
    return jsonResponse(200, 'Thanks. Your request has been received.');
  }

  const name = clean(payload.name, limits.name);
  const email = clean(payload.email, limits.email).toLowerCase();
  const details = clean(payload.details, limits.details);
  const errors: Record<string, string> = {};

  if (!name) errors.name = 'Enter your name.';
  if (!email || !emailPattern.test(email)) errors.email = 'Enter a valid work email.';
  if (!details) errors.details = 'Tell us a little about your project.';

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
      let providerMessage = 'Brevo request rejected';

      try {
        const providerError = JSON.parse(providerBody) as { code?: unknown; message?: unknown };
        if (typeof providerError.code === 'string' || typeof providerError.code === 'number') {
          providerCode = String(providerError.code).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'unknown';
        }
        if (typeof providerError.message === 'string') {
          providerMessage = providerError.message.replace(/\s+/g, ' ').slice(0, 120);
        }
      } catch {
        providerMessage = 'Brevo returned an unreadable error response';
      }

      console.error('Brevo contact delivery failed', {
        status: response.status,
        code: providerCode,
        message: providerMessage,
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
