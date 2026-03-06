// Dev-only guard for a known runtime profiling bug in Next.js/Turbopack.
// It prevents crashes from performance.measure negative timestamp errors.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const perf = window.performance

  if (perf && typeof perf.measure === "function") {
    const originalMeasure = perf.measure.bind(perf)

    perf.measure = ((...args: Parameters<typeof perf.measure>) => {
      try {
        return originalMeasure(...args)
      } catch (error: unknown) {
        const message =
          error instanceof Error ? String(error.message ?? "") : ""
        if (message.includes("cannot have a negative time stamp")) {
          return null as unknown as ReturnType<typeof perf.measure>
        }
        throw error
      }
    }) as typeof perf.measure
  }
}
