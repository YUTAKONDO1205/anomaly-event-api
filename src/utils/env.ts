function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const env = {
  eventsTable: getEnv("EVENTS_TABLE"),
  eventImagesBucket: getEnv("EVENT_IMAGES_BUCKET"),
  region: process.env.AWS_REGION || "ap-northeast-1"
};
