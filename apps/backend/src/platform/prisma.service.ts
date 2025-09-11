import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client/wasm';

@Injectable()
export class PrismaService extends PrismaClient {}
