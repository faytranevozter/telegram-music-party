-- AlterTable
ALTER TABLE "Feature" ADD COLUMN "refreshCommand" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "refreshOnlyAdmin" BOOLEAN NOT NULL DEFAULT true;