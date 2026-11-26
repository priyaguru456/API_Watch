import { describe, it, expect } from 'vitest';
import { isPrivateIp, validateUrl, SsrfError } from '../index.js';

describe('SSRF Guard (@apiwatch/ssrf-guard)', () => {
  describe('isPrivateIp', () => {
    it('correctly identifies private and reserved IPv4 addresses', () => {
      // Loopback
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('127.0.1.10')).toBe(true);
      // Private class A
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('10.254.1.5')).toBe(true);
      // Private class B
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('172.31.255.255')).toBe(true);
      // Private class C
      expect(isPrivateIp('192.168.1.1')).toBe(true);
      expect(isPrivateIp('192.168.100.50')).toBe(true);
      // Link-local / Cloud Metadata (AWS, GCP, Azure)
      expect(isPrivateIp('169.254.169.254')).toBe(true);
      // 0.0.0.0
      expect(isPrivateIp('0.0.0.0')).toBe(true);
      // Multicast / Reserved
      expect(isPrivateIp('224.0.0.1')).toBe(true);
      expect(isPrivateIp('240.0.0.1')).toBe(true);
    });

    it('correctly identifies public IPv4 addresses', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false); // Google DNS
      expect(isPrivateIp('1.1.1.1')).toBe(false); // Cloudflare DNS
      expect(isPrivateIp('93.184.216.34')).toBe(false); // example.com
      expect(isPrivateIp('172.32.0.1')).toBe(false); // Public (outside 172.16-31)
    });

    it('correctly identifies private and reserved IPv6 addresses', () => {
      // IPv6 Loopback
      expect(isPrivateIp('::1')).toBe(true);
      // IPv6 Unspecified
      expect(isPrivateIp('::')).toBe(true);
      // Unique Local Addresses
      expect(isPrivateIp('fc00::1')).toBe(true);
      expect(isPrivateIp('fd12:3456:789a:1::1')).toBe(true);
      // Link-local
      expect(isPrivateIp('fe80::1')).toBe(true);
      // IPv4-mapped private
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true);
    });
  });

  describe('validateUrl', () => {
    it('rejects unsupported protocols', async () => {
      await expect(validateUrl('ftp://example.com')).rejects.toThrow(SsrfError);
      await expect(validateUrl('file:///etc/passwd')).rejects.toThrow(SsrfError);
      await expect(validateUrl('gopher://example.com')).rejects.toThrow(SsrfError);
    });

    it('blocks direct private IP URLs', async () => {
      await expect(validateUrl('http://127.0.0.1:8080/admin')).rejects.toThrow(
        /private or reserved/
      );
      await expect(validateUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
        /private or reserved/
      );
      await expect(validateUrl('http://10.0.0.5/api')).rejects.toThrow(/private or reserved/);
      await expect(validateUrl('http://[::1]:3000')).rejects.toThrow(/private or reserved/);
    });
  });
});
