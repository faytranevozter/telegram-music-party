import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import '../config/env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    onModuleInit() {
        const provider = process.env.DATABASE_PROVIDER || 'postgresql';
        if (!['postgresql', 'sqlite'].includes(provider)) {
            throw new Error('DATABASE_PROVIDER must be postgresql or sqlite');
        }
        const clientRequire = createRequire(require.resolve('@prisma/client'));
        const schema = readFileSync(
            clientRequire.resolve('.prisma/client/schema.prisma'),
            'utf8',
        );
        if (!schema.includes(`provider = "${provider}"`)) {
            throw new Error(
                `Prisma client does not match DATABASE_PROVIDER=${provider}. Run pnpm db:generate and rebuild.`,
            );
        }
        const url = process.env.DATABASE_URL || '';
        if (
            !(provider === 'sqlite'
                ? url.startsWith('file:')
                : /^postgres(?:ql)?:\/\//.test(url))
        ) {
            throw new Error(
                `DATABASE_URL does not match DATABASE_PROVIDER=${provider}`,
            );
        }
    }
}
