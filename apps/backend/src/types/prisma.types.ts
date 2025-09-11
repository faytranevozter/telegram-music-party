// Temporary type definitions for Prisma models until client generation is fixed

export interface Room {
  id: string;
  chatId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  Queues: Queue[];
  Devices: Device[];
  Votes: Vote[];
  Feature?: Feature | null;
}

export interface Device {
  id: string;
  roomId: string;
  room: Room;
  name: string;
  fingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Queue {
  id: string;
  roomId: string;
  room?: Room;
  title: string;
  url: string;
  createdAt: Date | null;
  updatedAt: Date;
}

export interface Vote {
  id: string;
  roomId: string;
  room?: Room;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Feature {
  id: string;
  roomId: string;
  room?: Room;
  minimumVotes: number;
  nextCommand: boolean;
  nextOnlyAdmin: boolean;
  previousCommand: boolean;
  previousOnlyAdmin: boolean;
  muteCommand: boolean;
  unmuteCommand: boolean;
  volumeCommand: boolean;
  maxQueueSize: number;
  createdAt: Date;
  updatedAt: Date;
}

// Mock Prisma operations interfaces
interface FindFirstOptions {
  where?: Record<string, unknown>;
  include?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
}

interface FindManyOptions {
  where?: Record<string, unknown>;
  include?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  take?: number;
  skip?: number;
}

interface CreateOptions {
  data: Record<string, unknown>;
  include?: Record<string, unknown>;
}

interface UpdateOptions {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
}

interface DeleteOptions {
  where: Record<string, unknown>;
}

interface DeleteManyOptions {
  where?: Record<string, unknown>;
}

interface CountOptions {
  where?: Record<string, unknown>;
}

interface MockDelegate<T> {
  findFirst(options: FindFirstOptions): Promise<T | null>;
  findMany(options: FindManyOptions): Promise<T[]>;
  create(options: CreateOptions): Promise<T>;
  update(options: UpdateOptions): Promise<T>;
  delete(options: DeleteOptions): Promise<T>;
  deleteMany(options: DeleteManyOptions): Promise<{ count: number }>;
  count(options: CountOptions): Promise<number>;
}

// Mock Prisma Client for compilation
export interface PrismaClientType {
  room: MockDelegate<Room>;
  device: MockDelegate<Device>;
  queue: MockDelegate<Queue>;
  vote: MockDelegate<Vote>;
  feature: MockDelegate<Feature>;
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
}

class MockDelegateImpl<T> implements MockDelegate<T> {
  async findFirst(_options: FindFirstOptions): Promise<T | null> {
    throw new Error('Prisma client not properly initialized - this is a temporary mock');
  }

  async findMany(_options: FindManyOptions): Promise<T[]> {
    throw new Error('Prisma client not properly initialized - this is a temporary mock');
  }

  async create(_options: CreateOptions): Promise<T> {
    throw new Error('Prisma client not properly initialized - this is a temporary mock');
  }

  async update(_options: UpdateOptions): Promise<T> {
    throw new Error('Prisma client not properly initialized - this is a temporary mock');
  }

  async delete(_options: DeleteOptions): Promise<T> {
    throw new Error('Prisma client not properly initialized - this is a temporary mock');
  }

  async deleteMany(_options: DeleteManyOptions): Promise<{ count: number }> {
    throw new Error('Prisma client not properly initialized - this is a temporary mock');
  }

  async count(_options: CountOptions): Promise<number> {
    throw new Error('Prisma client not properly initialized - this is a temporary mock');
  }
}

export class PrismaClient implements PrismaClientType {
  room: MockDelegate<Room> = new MockDelegateImpl<Room>();
  device: MockDelegate<Device> = new MockDelegateImpl<Device>();
  queue: MockDelegate<Queue> = new MockDelegateImpl<Queue>();
  vote: MockDelegate<Vote> = new MockDelegateImpl<Vote>();
  feature: MockDelegate<Feature> = new MockDelegateImpl<Feature>();

  async $connect(): Promise<void> {
    throw new Error('Prisma client not properly initialized - this is a temporary mock');
  }

  async $disconnect(): Promise<void> {
    throw new Error('Prisma client not properly initialized - this is a temporary mock');
  }
}