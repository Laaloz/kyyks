export const FAST_ACTION_MIN_LOADING_MS = 350;

export async function withMinimumDelay<T>(
  promise: Promise<T>,
  minimumDelayMs = FAST_ACTION_MIN_LOADING_MS,
): Promise<T> {
  const [result] = await Promise.all([
    promise,
    new Promise((resolve) => setTimeout(resolve, minimumDelayMs)),
  ]);

  return result;
}
