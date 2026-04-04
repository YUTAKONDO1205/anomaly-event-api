export const logger = {
  info: (message: string, meta?: unknown) => {
    console.log(JSON.stringify({ level: "INFO", message, meta }));
  },
  error: (message: string, meta?: unknown) => {
    console.error(JSON.stringify({ level: "ERROR", message, meta }));
  }
};
