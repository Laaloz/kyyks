import {
  Activity,
  Bike,
  CircleDot,
  Dumbbell,
  Flame,
  Footprints,
  HeartPulse,
  Mountain,
  Music,
  PersonStanding,
  Snowflake,
  Swords,
  Waves,
} from "lucide-react";

// Kalenterimerkinnän pieni laji-ikoni (extra-treenit + voimaharjoitus).
export function renderCalendarActivityIcon(activityType: string) {
  if (activityType === "strength") return <Dumbbell className="size-3.5" aria-hidden="true" />;
  if (activityType === "run") return <Footprints className="size-3.5" aria-hidden="true" />;
  if (activityType === "walk") return <PersonStanding className="size-3.5" aria-hidden="true" />;
  if (activityType === "cycle") return <Bike className="size-3.5" aria-hidden="true" />;
  if (activityType === "indoor_cycle") return <Bike className="size-3.5" aria-hidden="true" />;
  if (activityType === "mtb") return <Bike className="size-3.5" aria-hidden="true" />;
  if (activityType === "treadmill") return <Footprints className="size-3.5" aria-hidden="true" />;
  if (activityType === "stair_climber") return <Mountain className="size-3.5" aria-hidden="true" />;
  if (activityType === "elliptical") return <Activity className="size-3.5" aria-hidden="true" />;
  if (activityType === "swim") return <Waves className="size-3.5" aria-hidden="true" />;
  if (activityType === "paddle") return <Waves className="size-3.5" aria-hidden="true" />;
  if (activityType === "climb" || activityType === "hike") return <Mountain className="size-3.5" aria-hidden="true" />;
  if (activityType === "row") return <Activity className="size-3.5" aria-hidden="true" />;
  if (activityType === "ski" || activityType === "downhill_ski" || activityType === "skate") return <Snowflake className="size-3.5" aria-hidden="true" />;
  if (activityType === "disc_golf") return <CircleDot className="size-3.5" aria-hidden="true" />;
  if (activityType === "yoga" || activityType === "mobility") return <HeartPulse className="size-3.5" aria-hidden="true" />;
  if (activityType === "hiit") return <Flame className="size-3.5" aria-hidden="true" />;
  if (activityType === "combat") return <Swords className="size-3.5" aria-hidden="true" />;
  if (activityType === "dance") return <Music className="size-3.5" aria-hidden="true" />;
  return <CircleDot className="size-3.5" aria-hidden="true" />;
}
