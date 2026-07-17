-- CreateTable
CREATE TABLE "dorm_announcements" (
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

    CONSTRAINT "dorm_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dorm_announcement_attachments" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dorm_announcement_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dorm_info_items" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dorm_info_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dorm_forms" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "storedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dorm_forms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dorm_announcements_isPublished_pinned_publishedAt_idx" ON "dorm_announcements"("isPublished", "pinned", "publishedAt");

-- CreateIndex
CREATE INDEX "dorm_announcement_attachments_announcementId_idx" ON "dorm_announcement_attachments"("announcementId");

-- CreateIndex
CREATE INDEX "dorm_info_items_section_isPublished_sortOrder_idx" ON "dorm_info_items"("section", "isPublished", "sortOrder");

-- CreateIndex
CREATE INDEX "dorm_forms_isPublished_sortOrder_idx" ON "dorm_forms"("isPublished", "sortOrder");

-- AddForeignKey
ALTER TABLE "dorm_announcement_attachments" ADD CONSTRAINT "dorm_announcement_attachments_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "dorm_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
