import type { ProgramWorkout } from "@/lib/types";

function compactExerciseNames(workout: Pick<ProgramWorkout, "exercises">) {
  return workout.exercises
    .map((exercise) => exercise.exerciseName?.trim())
    .filter((name): name is string => Boolean(name))
    .slice(0, 3);
}

function listExerciseNames(names: string[]) {
  if (names.length === 0) {
    return "";
  }

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} ja ${names[1]}`;
  }

  return `${names[0]}, ${names[1]} ja ${names[2]}`;
}

export function deriveProgramWorkoutGuidance(workout: Pick<ProgramWorkout, "guidance" | "splitType" | "exercises">) {
  const explicitGuidance = workout.guidance?.trim();
  if (explicitGuidance) {
    return explicitGuidance;
  }

  const exerciseNames = compactExerciseNames(workout);
  const exerciseLead = listExerciseNames(exerciseNames);

  switch (workout.splitType) {
    case "upper":
      return exerciseLead
        ? `Pääpaino liikkeissä ${exerciseLead}. Tee isot työntö- ja vetoliikkeet rauhassa ensin, pidä pitkät palautukset pääliikkeissä ja hae loppuun siisti tuntuma käsille ja hartioille.`
        : "Tee isot työntö- ja vetoliikkeet ensin, pidä pitkät palautukset pääliikkeissä ja hae loppuun siisti tuntuma käsille ja hartioille.";
    case "lower":
      return exerciseLead
        ? `Pääpaino liikkeissä ${exerciseLead}. Aloita raskaammista jalkaliikkeistä, pidä tempo hallittuna ja säästä hieman varaa ennen eristäviä liikkeitä.`
        : "Aloita raskaammista jalkaliikkeistä, pidä tempo hallittuna ja säästä hieman varaa ennen eristäviä liikkeitä.";
    case "full_body":
      return exerciseLead
        ? `Tässä treenissä painottuvat ${exerciseLead}. Pidä koko treenin tempo tasaisena, keskity teknisesti puhtaisiin toistoihin ja jätä isoihin liikkeisiin hieman varaa.`
        : "Pidä koko treenin tempo tasaisena, keskity teknisesti puhtaisiin toistoihin ja jätä isoihin liikkeisiin hieman varaa.";
    default:
      return exerciseLead
        ? `Tämän treenin fokus on liikkeissä ${exerciseLead}. Tee pääliikkeet ensin huolellisesti ja pidä koko treenin ajan hyvä kontrolli sekä tasainen rytmi.`
        : "Tee pääliikkeet ensin huolellisesti ja pidä koko treenin ajan hyvä kontrolli sekä tasainen rytmi.";
  }
}
