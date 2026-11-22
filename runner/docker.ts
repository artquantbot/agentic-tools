import { execFile } from "node:child_process";
import { videoSmoke } from "../src/studio.ts";

const context = process.env.STACK_DOCKER_CONTEXT || "default";
if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(context)) throw new Error("Invalid Docker context.");
const clientEnv = { PATH: process.env.PATH, HOME: process.env.HOME };
const containerId = /^[a-f0-9]{64}$/;

function docker(args: string[], timeout: number, log?: (chunk: string) => void) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = execFile("docker", ["--context", context, ...args], {
      env: clientEnv, encoding: "buffer", maxBuffer: 512 * 1024, timeout, killSignal: "SIGKILL"
    }, (error, stdout) => {
      if (error) reject(new Error(error.code === "ENOENT" ? "Docker CLI unavailable." :
        error.killed ? "Docker command exceeded its time limit." : "Docker command failed. Check the local daemon and pinned image."));
      else resolve(stdout);
    });
    if (log) child.stderr?.setEncoding("utf8").on("data", log);
  });
}

async function inspectImage() {
  try {
    const endpoint = await docker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}", context], 2_000);
    if (!endpoint.toString().trim().startsWith("unix:///")) return false;
    await docker(["image", "inspect", "--format", "{{.Id}}", videoSmoke.image], 4_000);
    return true;
  } catch { return false; }
}

let inspection: Promise<boolean> | undefined;
export function imageReady() {
  inspection ??= inspectImage().finally(() => { inspection = undefined; });
  return inspection;
}

export async function createContainer(name: string) {
  const output = await docker([
    "container", "create", "--pull=never", "--name", name, "--label", "org.agentic-tools.scope=video-smoke",
    "--network=none", "--ipc=private", "--no-healthcheck", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
    "--user=65534:65534", "--pids-limit=" + videoSmoke.pids, "--cpus=" + videoSmoke.cpu,
    "--memory=" + videoSmoke.memoryMiB + "m", "--memory-swap=" + videoSmoke.memoryMiB + "m",
    "--log-driver=none", "--entrypoint=/ffmpeg", videoSmoke.image,
    "-hide_banner", "-nostdin", "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=10",
    "-t", "1", "-an", "-threads", "1", "-c:v", "mpeg4",
    "-movflags", "empty_moov+frag_keyframe+default_base_moof", "-f", "mp4", "pipe:1"
  ], 8_000);
  const id = output.toString().trim();
  if (!containerId.test(id)) throw new Error("Docker returned an invalid container identifier.");
  return id;
}

export const startContainer = (id: string, log: (chunk: string) => void) =>
  docker(["container", "start", "--attach", id], videoSmoke.timeoutSeconds * 1_000, log);

export const stopContainer = (id: string) => docker(["container", "stop", "--time", "1", id], 8_000);
export const removeContainer = (id: string) => docker(["container", "rm", "--force", id], 8_000);
