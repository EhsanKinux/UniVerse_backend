-- CreateTable
CREATE TABLE "chart_departments" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📚',
    "color" TEXT NOT NULL DEFAULT 'computer',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chart_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_files" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "badge" TEXT,
    "storedName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chart_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chart_departments_slug_key" ON "chart_departments"("slug");

-- CreateIndex
CREATE INDEX "chart_departments_isPublished_sortOrder_idx" ON "chart_departments"("isPublished", "sortOrder");

-- CreateIndex
CREATE INDEX "chart_files_departmentId_idx" ON "chart_files"("departmentId");

-- AddForeignKey
ALTER TABLE "chart_files" ADD CONSTRAINT "chart_files_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "chart_departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
