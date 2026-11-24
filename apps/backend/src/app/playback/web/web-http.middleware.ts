import type { NextFunction, Request, Response } from 'express';
import { ENV } from 'src/config/env';

export function webHttpBoundary(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    if (!ENV.WEB_ROOMS.enabled) {
        next();
        return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.vary('Origin');
    const origin = req.headers.origin;
    if (origin !== undefined) {
        if (origin !== ENV.WEB_ROOMS.origin) {
            res.sendStatus(403);
            return;
        }
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader(
            'Access-Control-Allow-Headers',
            'Authorization, Content-Type',
        );
    }
    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }
    const body: unknown = req.body;
    if (body !== undefined && Buffer.byteLength(JSON.stringify(body)) > 8192) {
        res.sendStatus(413);
        return;
    }
    next();
}
