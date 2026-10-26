-- The first command was renamed from /refresh to /radio.
ALTER TABLE "Feature" RENAME COLUMN "refreshCommand" TO "radioCommand";
ALTER TABLE "Feature" RENAME COLUMN "refreshOnlyAdmin" TO "radioOnlyAdmin";

-- Keep /refresh as a separate command with its own switches.
ALTER TABLE "Feature" ADD COLUMN "refreshCommand" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "refreshOnlyAdmin" BOOLEAN NOT NULL DEFAULT true;
