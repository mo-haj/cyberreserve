-- Once-a-day jobs that must run exactly once (the super admin's daily report).
CREATE TABLE "JobRun" (
    "key" TEXT NOT NULL,
    "doneAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("key")
);
