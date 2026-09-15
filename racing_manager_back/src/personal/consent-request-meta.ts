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

function readClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  if (Array.isArray(forwarded)) {
    const first = forwarded[0]?.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const ip = req.ip ?? req.socket.remoteAddress;
  return ip ? ip.slice(0, 64) : null;
}

function readUserAgent(req: Request): string | null {
  const header = req.headers['user-agent'];
  if (typeof header !== 'string' || !header.trim()) return null;
  return header.slice(0, 512);
}
