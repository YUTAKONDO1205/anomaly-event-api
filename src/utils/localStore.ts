import { promises as fs } from "node:fs";
import path from "node:path";
import { EventItem } from "../models/event";
import { env } from "./env";

let eventsFileLock: Promise<unknown> = Promise.resolve();

async function ensureDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function withEventsFileLock<T>(action: () => Promise<T>): Promise<T> {
  const current = eventsFileLock.then(action, action);
  eventsFileLock = current.then(
    () => undefined,
    () => undefined
  );
  return current;
}

async function loadLocalEventsUnlocked(): Promise<EventItem[]> {
  try {
    const content = await fs.readFile(env.localEventsFile, "utf8");
    const parsed = JSON.parse(content) as EventItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function countFilesInDirectory(directoryPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    let total = 0;

    for (const entry of entries) {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        total += await countFilesInDirectory(fullPath);
        continue;
      }

      total += 1;
    }

    return total;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }

    throw error;
  }
}

async function writeLocalEventsUnlocked(items: EventItem[]): Promise<void> {
  await ensureDirectory(env.localEventsFile);
  const tempFile = `${env.localEventsFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(items, null, 2), "utf8");
  await fs.rename(tempFile, env.localEventsFile);
}

export async function readLocalEvents(): Promise<EventItem[]> {
  return withEventsFileLock(loadLocalEventsUnlocked);
}

export async function writeLocalEvents(items: EventItem[]): Promise<void> {
  await withEventsFileLock(() => writeLocalEventsUnlocked(items));
}

export async function updateLocalEvents(mutator: (items: EventItem[]) => Promise<EventItem[]> | EventItem[]): Promise<EventItem[]> {
  return withEventsFileLock(async () => {
    const items = await loadLocalEventsUnlocked();
    const nextItems = await mutator(items);
    await writeLocalEventsUnlocked(nextItems);
    return nextItems;
  });
}

export async function resetLocalEventStorage(): Promise<{ eventsCleared: number; uploadsCleared: number }> {
  return withEventsFileLock(async () => {
    const events = await loadLocalEventsUnlocked();
    const uploadsCleared = await countFilesInDirectory(env.localUploadsDir);

    await writeLocalEventsUnlocked([]);
    await fs.rm(env.localUploadsDir, { recursive: true, force: true });
    await fs.mkdir(env.localUploadsDir, { recursive: true });

    return {
      eventsCleared: events.length,
      uploadsCleared
    };
  });
}

export function resolveLocalUploadPath(imageKey: string): string {
  return path.join(env.localUploadsDir, imageKey);
}

export async function writeLocalUpload(imageKey: string, bytes: Uint8Array): Promise<string> {
  const filePath = resolveLocalUploadPath(imageKey);
  await ensureDirectory(filePath);
  await fs.writeFile(filePath, bytes);
  return filePath;
}

export async function readLocalUpload(imageKey: string): Promise<Uint8Array> {
  const filePath = resolveLocalUploadPath(imageKey);
  return fs.readFile(filePath);
}
