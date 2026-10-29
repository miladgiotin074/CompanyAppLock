import { api } from '../api.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until the phone finishes the command, or the wait runs out. */
export async function waitForCommand(commandId, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(600);
    const command = await api.getCommand(commandId);
    if (command.status === 'done' || command.status === 'failed') return command;
  }
  return null;
}

/**
 * Ask one phone to measure again. `state` re-checks permissions and hardware.
 * `apps` re-scans installed packages. Resolves true only after that upload lands.
 */
export async function askDevice(deviceId, scope) {
  const issued = await api.refreshDevice(deviceId, scope);
  if (!issued?.ok || !issued.commandId) return false;
  const command = await waitForCommand(issued.commandId);
  return command?.status === 'done';
}
