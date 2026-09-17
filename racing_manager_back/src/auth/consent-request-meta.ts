import type { Request } from 'express';

export type ConsentRequestMeta = {
  ip: string | null;
  userAgent: string | null;
};

export function readConsentRequestMeta(req: Request): ConsentRequestMeta {
  return {
    ip: readClientIp(req),
    userAgent: readUserAgent(req),
  };
}

export function mergeConsentRequestMeta(
  current: ConsentRequestMeta,
  saved?: ConsentRequestMeta | null,
): ConsentRequestMeta {
  if (!saved) return current;
  return {
    ip: pickClientIp(current.ip, saved.ip),
    userAgent: current.userAgent ?? saved.userAgent,
  };
}

function readClientIp(req: Request): string | null {
  const candidates = [
    req.ip,
    headerIp(req.headers['cf-connecting-ip']),
    headerIp(req.headers['true-client-ip']),
    headerIp(req.headers['x-real-ip']),
    headerIp(req.headers['x-forwarded-for']),
    req.socket.remoteAddress,
  ];

  const ips = candidates
    .map(normalizeClientIp)
    .filter((ip): ip is string => ip !== null);

  return ips.find((ip) => !isLoopbackIp(ip)) ?? ips[0] ?? null;
}

function pickClientIp(
  current: string | null,
  saved: string | null,
): string | null {
  if (current && !isLoopbackIp(current)) return current;
  if (saved && !isLoopbackIp(saved)) return saved;
  return current ?? saved;
}

function headerIp(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(',')[0]?.trim();
}

function normalizeClientIp(value: string | undefined | null): string | null {
  if (!value) return null;
  let ip = value.trim();
  if (!ip) return null;
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }
  if (ip.toLowerCase().startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);
  if (ipv4WithPort) ip = ipv4WithPort[1];
  return ip.slice(0, 64);
}

function isLoopbackIp(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized.startsWith('127.')
  );
}

function readUserAgent(req: Request): string | null {
  const header = req.headers['user-agent'];
  if (typeof header !== 'string' || !header.trim()) return null;
  return header.slice(0, 512);
}
