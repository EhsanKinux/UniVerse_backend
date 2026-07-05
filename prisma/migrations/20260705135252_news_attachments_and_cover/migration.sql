-- AlterTable
ALTER TABLE "news" ADD COLUMN     "coverMimeType" TEXT,
ADD COLUMN     "coverStoredName" TEXT;

-- CreateTable
CREATE TABLE "news_attachments" (
    "id" TEXT NOT NULL,
    "newsId" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_attachments_newsId_idx" ON "news_attachments"("newsId");

-- AddForeignKey
ALTER TABLE "news_attachments" ADD CONSTRAINT "news_attachments_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;
