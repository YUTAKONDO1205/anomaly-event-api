import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const frontendRoot = path.join(repoRoot, "frontend");
const outputRoot = path.join(repoRoot, ".aws-frontend-build");

function parseArgs(argv) {
  const options = {
    stackName: "anomaly-event-api",
    region: process.env.AWS_REGION || "",
    apiUrl: "",
    bucket: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];

    if (value === "--stack-name" && next) {
      options.stackName = next;
      index += 1;
      continue;
    }

    if (value === "--region" && next) {
      options.region = next;
      index += 1;
      continue;
    }

    if (value === "--api-url" && next) {
      options.apiUrl = next;
      index += 1;
      continue;
    }

    if (value === "--bucket" && next) {
      options.bucket = next;
      index += 1;
    }
  }

  return options;
}

function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
    });

    let stdout = "";
    let stderr = "";

    if (capture) {
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });

      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}${stderr ? `\n${stderr}` : ""}`));
    });
  });
}

function normalizeUrl(value) {
  return value.trim().replace(/\/$/, "");
}

async function loadStackOutputs(stackName, region) {
  const args = ["cloudformation", "describe-stacks", "--stack-name", stackName, "--output", "json"];
  if (region) {
    args.push("--region", region);
  }

  const { stdout } = await run("aws", args, { capture: true });
  const parsed = JSON.parse(stdout);
  const outputs = parsed.Stacks?.[0]?.Outputs ?? [];
  return Object.fromEntries(outputs.map((item) => [item.OutputKey, item.OutputValue]));
}

async function buildBundle(apiUrl) {
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.cp(frontendRoot, outputRoot, { recursive: true });
  await fs.writeFile(
    path.join(outputRoot, "app-config.js"),
    `window.__APP_CONFIG__ = ${JSON.stringify({ apiBaseUrl: normalizeUrl(apiUrl) }, null, 2)};\n`,
    "utf8"
  );
}

async function syncBundle(bucket, region) {
  const regionArgs = region ? ["--region", region] : [];

  await run(
    "aws",
    [
      "s3",
      "sync",
      outputRoot,
      `s3://${bucket}`,
      "--delete",
      "--exclude",
      "index.html",
      "--exclude",
      "app-config.js",
      ...regionArgs
    ],
    { capture: false }
  );

  await run(
    "aws",
    [
      "s3",
      "cp",
      path.join(outputRoot, "index.html"),
      `s3://${bucket}/index.html`,
      "--content-type",
      "text/html; charset=utf-8",
      "--cache-control",
      "no-cache, no-store, must-revalidate",
      ...regionArgs
    ],
    { capture: false }
  );

  await run(
    "aws",
    [
      "s3",
      "cp",
      path.join(outputRoot, "app-config.js"),
      `s3://${bucket}/app-config.js`,
      "--content-type",
      "application/javascript; charset=utf-8",
      "--cache-control",
      "no-cache, no-store, must-revalidate",
      ...regionArgs
    ],
    { capture: false }
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputs =
    options.apiUrl && options.bucket ? {} : await loadStackOutputs(options.stackName, options.region);
  const apiUrl = normalizeUrl(options.apiUrl || outputs.ApiUrl || "");
  const bucket = options.bucket || outputs.FrontendBucketName || "";
  const websiteUrl = outputs.FrontendWebsiteUrl || "";

  if (!apiUrl) {
    throw new Error("API URL could not be resolved. Pass --api-url or deploy the SAM stack first.");
  }

  if (!bucket) {
    throw new Error("Frontend bucket could not be resolved. Pass --bucket or deploy the SAM stack first.");
  }

  await buildBundle(apiUrl);
  await syncBundle(bucket, options.region);

  console.log(`Frontend published to s3://${bucket}`);
  console.log(`API Base URL: ${apiUrl}`);
  if (websiteUrl) {
    console.log(`Website URL: ${websiteUrl}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
