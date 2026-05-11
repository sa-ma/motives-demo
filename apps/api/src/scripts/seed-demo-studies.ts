import { inArray } from "drizzle-orm";

import { createDatabaseClient, createPgPool } from "../db/client.js";
import { loadApiConfig } from "../lib/config.js";
import {
  debriefReport,
  interviewSession,
  participantField,
  participantProfile,
  study,
  studyAggregate,
  studyPlanVersion,
  studyTopic,
  transcriptTurn,
} from "../db/schema.js";
import { buildDemoStudies, DEMO_STUDY_IDS } from "../demo/demo-studies.js";

async function main() {
  const config = loadApiConfig();
  const pool = createPgPool(config.DATABASE_URL);
  const db = createDatabaseClient(pool);
  const demoStudies = buildDemoStudies();

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(study)
        .where(inArray(study.id, DEMO_STUDY_IDS));

      for (const demoStudy of demoStudies) {
        await tx.insert(study).values(demoStudy.studyInsert);
        await tx.insert(studyTopic).values(demoStudy.topicInserts);
        await tx.insert(participantField).values(demoStudy.participantFieldInserts);
        await tx.insert(studyPlanVersion).values(demoStudy.planVersionInserts);
        await tx.insert(interviewSession).values(demoStudy.sessionInserts);
        await tx.insert(participantProfile).values(demoStudy.profileInserts);
        await tx.insert(transcriptTurn).values(demoStudy.transcriptInserts);
        await tx.insert(debriefReport).values(demoStudy.debriefInserts);
        await tx.insert(studyAggregate).values(demoStudy.aggregateInsert);
      }
    });

    console.log("Seeded demo studies:");
    for (const demoStudy of demoStudies) {
      console.log(
        `- ${demoStudy.id} (${demoStudy.status}) with ${demoStudy.sessionInserts.length} completed participants`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to seed demo studies.");
  console.error(error);
  process.exit(1);
});
