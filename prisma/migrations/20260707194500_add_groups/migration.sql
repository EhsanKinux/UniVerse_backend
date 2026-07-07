-- CreateTable
CREATE TABLE "group_categories" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "platform" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_links" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'link',
    "label" TEXT,
    "url" TEXT,
    "handle" TEXT,
    "qrStoredName" TEXT,
    "qrMimeType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_categories_isPublished_sortOrder_idx" ON "group_categories"("isPublished", "sortOrder");

-- CreateIndex
CREATE INDEX "groups_categoryId_idx" ON "groups"("categoryId");

-- CreateIndex
CREATE INDEX "group_links_groupId_idx" ON "group_links"("groupId");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "group_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_links" ADD CONSTRAINT "group_links_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
