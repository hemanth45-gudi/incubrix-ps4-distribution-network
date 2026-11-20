-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "platform_key" TEXT NOT NULL,
    "surface" TEXT NOT NULL DEFAULT 'default',
    "category" TEXT,
    "audience_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT NOT NULL DEFAULT 'en',
    "geo" TEXT,
    "est_audience" INTEGER,
    "rules_url" TEXT,
    "frequency_cap" JSONB,
    "self_promo_allowed" BOOLEAN NOT NULL DEFAULT true,
    "link_policy" TEXT NOT NULL DEFAULT 'allowed',
    "disclosure_required" BOOLEAN NOT NULL DEFAULT false,
    "automation_allowed" BOOLEAN NOT NULL DEFAULT true,
    "connector_key" TEXT NOT NULL,
    "relevance_score" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "relevance_reason" TEXT,
    "level" TEXT NOT NULL DEFAULT 'L0',
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_certified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostingRuleDecision" (
    "id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "rule_name" TEXT NOT NULL,
    "pass" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "action_taken" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostingRuleDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "connector_key" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "live_url" TEXT,
    "platform_post_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationMetric" (
    "id" TEXT NOT NULL,
    "publication_id" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER,
    "watch_time_s" INTEGER,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificationRun" (
    "id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "connector_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "is_simulated" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "test_input" JSONB,
    "validation_response" JSONB,
    "publish_response" JSONB,
    "status_response" JSONB,
    "delete_response" JSONB,
    "failure_reason" TEXT,
    "evidence_ref" TEXT,

    CONSTRAINT "CertificationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogueImport" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error_report" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "CatalogueImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response_code" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Destination_url_platform_key_key" ON "Destination"("url", "platform_key");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_idempotency_key_key" ON "Publication"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_key_key" ON "IdempotencyRecord"("key");

-- AddForeignKey
ALTER TABLE "PostingRuleDecision" ADD CONSTRAINT "PostingRuleDecision_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationMetric" ADD CONSTRAINT "PublicationMetric_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificationRun" ADD CONSTRAINT "CertificationRun_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
