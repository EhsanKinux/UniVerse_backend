-- CreateTable
CREATE TABLE "food_announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "coverStoredName" TEXT,
    "coverMimeType" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_announcement_attachments" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_announcement_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_menu_files" (
    "id" TEXT NOT NULL,
    "weekLabel" TEXT,
    "storedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_menu_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_announcements_isPublished_pinned_publishedAt_idx" ON "food_announcements"("isPublished", "pinned", "publishedAt");

-- CreateIndex
CREATE INDEX "food_announcement_attachments_announcementId_idx" ON "food_announcement_attachments"("announcementId");

-- CreateIndex
CREATE INDEX "food_menu_files_isPublished_createdAt_idx" ON "food_menu_files"("isPublished", "createdAt");

-- AddForeignKey
ALTER TABLE "food_announcement_attachments" ADD CONSTRAINT "food_announcement_attachments_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "food_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
