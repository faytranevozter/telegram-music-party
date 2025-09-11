import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../types/prisma.types';

@Injectable()
export class PrismaService extends PrismaClient {}
