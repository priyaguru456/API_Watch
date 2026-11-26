import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { URL } from 'node:url';
import { isPrivateIp } from './ip.js';

export class SsrfError extends Error {
  constructor(message, code = 'SSRF_BLOCKED') {
    super(message);
    this.name = 'SsrfError';
    this.code = code;
  }
}

/**
 * Validates a target URL and its resolved IP addresses to ensure it does not
 * resolve to private, loopback, or cloud metadata endpoints.
 *
 * @param {string} rawUrl
 * @returns {Promise<{ parsedUrl: URL, resolvedIps: string[] }>}
 */
export async function validateUrl(rawUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (_err) {
    throw new SsrfError(`Invalid URL string: ${rawUrl}`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new SsrfError(
      `Unsupported protocol: ${parsedUrl.protocol}. Only http: and https: are permitted.`
    );
  }

  const rawHostname = parsedUrl.hostname;
  if (!rawHostname) {
    throw new SsrfError('URL hostname cannot be empty.');
  }

  // Strip IPv6 brackets if present (e.g. [::1] -> ::1)
  const hostname =
    rawHostname.startsWith('[') && rawHostname.endsWith(']')
      ? rawHostname.slice(1, -1)
      : rawHostname;

  // If hostname is directly an IP literal
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new SsrfError(`Target IP ${hostname} is private or reserved.`);
    }
    return { parsedUrl, resolvedIps: [hostname] };
  }

  // Resolve hostname
  let addresses = [];
  try {
    const resolved = await dns.lookup(hostname, { all: true });
    addresses = resolved.map((r) => r.address);
  } catch (err) {
    throw new SsrfError(`DNS resolution failed for hostname "${hostname}": ${err.message}`);
  }

  if (addresses.length === 0) {
    throw new SsrfError(`No IP addresses found for hostname "${hostname}".`);
  }

  // Check every resolved address
  for (const addr of addresses) {
    if (isPrivateIp(addr)) {
      throw new SsrfError(
        `DNS resolution for hostname "${hostname}" resolved to forbidden private or reserved IP: ${addr}`
      );
    }
  }

  return { parsedUrl, resolvedIps: addresses };
}

/**
 * Performs a safe outbound HTTP/HTTPS request, pinning the resolved IP to prevent DNS rebinding.
 * Returns response metadata, timings, and body.
 */
export async function safeFetch(targetUrl, options = {}) {
  const { method = 'GET', headers = {}, body = null, timeoutMs = 10000 } = options;

  const dnsStartTime = performance.now();
  const { parsedUrl, resolvedIps } = await validateUrl(targetUrl);
  const dnsEndTime = performance.now();
  const dnsMs = Math.round(dnsEndTime - dnsStartTime);

  const pinnedIp = resolvedIps[0];
  const isHttps = parsedUrl.protocol === 'https:';
  const defaultPort = isHttps ? 443 : 80;
  const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : defaultPort;

  return new Promise((resolve, reject) => {
    const reqStartTime = performance.now();
    let connectTime = 0;
    let ttfbTime = 0;

    const requestOptions = {
      protocol: parsedUrl.protocol,
      hostname: pinnedIp,
      port,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: method.toUpperCase(),
      headers: {
        ...headers,
        Host: parsedUrl.host,
        'User-Agent': headers['User-Agent'] || 'APIWatch-Monitor/1.0',
      },
      timeout: timeoutMs,
      ...(isHttps ? { servername: parsedUrl.hostname.replace(/^\[|\]$/g, '') } : {}),
    };

    const client = isHttps ? https : http;
    const req = client.request(requestOptions, (res) => {
      ttfbTime = performance.now();
      const chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const totalEndTime = performance.now();
        const totalMs = Math.round(totalEndTime - reqStartTime);
        const connectMs = connectTime ? Math.round(connectTime - reqStartTime) : 0;
        const ttfbMs = ttfbTime ? Math.round(ttfbTime - reqStartTime) : 0;

        const responseHeaders = {};
        for (const [key, val] of Object.entries(res.headers)) {
          if (Array.isArray(val)) {
            responseHeaders[key] = val.join(', ');
          } else if (val !== undefined) {
            responseHeaders[key] = String(val);
          }
        }

        const bodyString = Buffer.concat(chunks).toString('utf8');

        resolve({
          statusCode: res.statusCode || 0,
          statusText: res.statusMessage || '',
          headers: responseHeaders,
          body: bodyString,
          timing: {
            dnsMs,
            connectMs,
            ttfbMs,
            totalMs,
          },
          resolvedIp: pinnedIp,
        });
      });
    });

    req.on('socket', (socket) => {
      socket.on('connect', () => {
        connectTime = performance.now();
      });
      if (isHttps) {
        socket.on('secureConnect', () => {
          connectTime = performance.now();
        });
      }
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}
