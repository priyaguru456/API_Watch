import net from 'node:net';

/**
 * Checks whether an IPv4 or IPv6 address belongs to private, loopback,
 * link-local, multicast, or reserved ranges.
 *
 * @param {string} ip
 * @returns {boolean} true if private/reserved/unroutable, false if public
 */
export function isPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return true;

  const version = net.isIP(ip);
  if (version === 0) return true; // Invalid IP

  if (version === 4) {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }

    const [a, b] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;

    // 10.0.0.0/8 (Private class A)
    if (a === 10) return true;

    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;

    // 169.254.0.0/16 (Link-local, AWS/GCP/Azure instance metadata 169.254.169.254)
    if (a === 169 && b === 254) return true;

    // 172.16.0.0/12 (Private class B: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16 (Private class C)
    if (a === 192 && b === 168) return true;

    // 100.64.0.0/10 (Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;

    // 192.0.0.0/24 (IETF Protocol Assignments)
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0) return true;

    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51) return true;

    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0) return true;

    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;

    // 240.0.0.0/4 (Reserved / Future Use)
    if (a >= 240) return true;

    return false;
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();

    // ::1 (IPv6 Loopback)
    if (normalized === '::1' || normalized === '0000:0000:0000:0000:0000:0000:0000:0001') {
      return true;
    }

    // :: (Unspecified)
    if (normalized === '::' || /^0(:0)*$/.test(normalized)) {
      return true;
    }

    // IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1)
    if (normalized.startsWith('::ffff:')) {
      const v4Part = normalized.replace('::ffff:', '');
      return isPrivateIp(v4Part);
    }

    // fc00::/7 (Unique Local Address)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
      return true;
    }

    // fe80::/10 (Link-local)
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true;
    }

    // ff00::/8 (Multicast)
    if (normalized.startsWith('ff')) {
      return true;
    }

    return false;
  }

  return true;
}
