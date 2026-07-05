-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "nationalId" TEXT,
    "birthDate" TEXT,
    "gender" TEXT,
    "province" TEXT,
    "city" TEXT,
    "studentId" TEXT,
    "major" TEXT,
    "faculty" TEXT,
    "degree" TEXT,
    "entryYear" INTEGER,
    "advisor" TEXT,
    "avatarStoredName" TEXT,
    "avatarMimeType" TEXT,
    "bio" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "telegram" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_nationalId_key" ON "profiles"("nationalId");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_studentId_key" ON "profiles"("studentId");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
