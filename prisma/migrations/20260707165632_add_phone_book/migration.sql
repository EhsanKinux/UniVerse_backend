-- CreateTable
CREATE TABLE "contact_groups" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'phone',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "ext" TEXT,
    "note" TEXT,
    "email" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_groups_isPublished_sortOrder_idx" ON "contact_groups"("isPublished", "sortOrder");

-- CreateIndex
CREATE INDEX "contacts_groupId_idx" ON "contacts"("groupId");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "contact_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
