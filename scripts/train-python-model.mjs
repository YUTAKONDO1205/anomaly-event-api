import { spawn } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";
const scriptPath = path.join(repoRoot, "python", "crack_ml.py");
const payload = {
  manifestPath: path.join(repoRoot, "datasets", "manifests", "index.json"),
  modelPath: path.join(repoRoot, "local-storage", "ml", "crack-local-model.json")
};

const child = spawn(pythonExecutable, [scriptPath, "train"], {
  cwd: repoRoot,
  stdio: ["pipe", "pipe", "pipe"]
});

child.stdout.on("data", (chunk) => process.stdout.write(chunk));
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.stdin.write(JSON.stringify(payload));
child.stdin.end();
