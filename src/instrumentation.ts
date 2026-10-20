export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPhoneWorker } = await import("./lib/phone/worker");
    startPhoneWorker();
  }
}
