import type { ListStudiesQuery } from "@motives-ai/contracts";

import { StudiesPage } from "@/components/studies/studies-page";
import { getInitialStudies } from "@/lib/api/server";

const defaultStudiesQuery: ListStudiesQuery = {
  sort: "updated-desc",
};

export default async function StudiesRoute() {
  const initialStudies = await getInitialStudies(defaultStudiesQuery).catch(
    () => null,
  );

  return <StudiesPage initialStudies={initialStudies} />;
}
