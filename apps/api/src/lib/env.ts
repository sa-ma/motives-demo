function isMissingEnvFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export function loadApiEnv() {
  try {
    process.loadEnvFile(new URL("../../../../.env", import.meta.url));
  } catch (error) {
    if (!isMissingEnvFileError(error)) {
      throw error;
    }
  }
}
