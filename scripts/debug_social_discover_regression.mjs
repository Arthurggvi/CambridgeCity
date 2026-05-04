import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const PORT = 5502;
const BASE_URL = `http://${HOST}:${PORT}/?debugTools=1&debug_social_discover_regression=${Date.now()}`;

function log(message, payload = null) {
  if (payload == null) {
    console.log(`[debug-social-discover] ${message}`);
    return;
  }
  console.log(`[debug-social-discover] ${message}`, payload);
}

function assert(condition, message, payload = null) {
  if (condition) return;
  const error = new Error(message);
  if (payload != null) {
    error.payload = payload;
  }
  throw error;
}

async function waitForServerReady(serverProcess, timeoutMs = 15000) {
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let ready = false;

  const onStdout = (chunk) => {
    const text = String(chunk || "");
    stdoutBuffer += text;
    if (text.includes("Static server running at")) {
      ready = true;
    }
  };

  const onStderr = (chunk) => {
    stderrBuffer += String(chunk || "");
  };

  serverProcess.stdout.on("data", onStdout);
  serverProcess.stderr.on("data", onStderr);

  const startedAt = Date.now();
  while (!ready && Date.now() - startedAt < timeoutMs) {
    if (serverProcess.exitCode != null) {
      throw new Error(`Static server exited early: code=${serverProcess.exitCode} stderr=${stderrBuffer.trim()}`);
    }
    await delay(100);
  }

  serverProcess.stdout.off("data", onStdout);
  serverProcess.stderr.off("data", onStderr);

  assert(ready, "Timed out waiting for static server", {
    stdout: stdoutBuffer.trim(),
    stderr: stderrBuffer.trim()
  });

  return {
    stdout: stdoutBuffer.trim(),
    stderr: stderrBuffer.trim()
  };
}

function startServer() {
  return spawn(process.execPath, ["./launcher/cambrian_static_server.js", "--host", HOST, "--port", String(PORT), "--root", "."], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function runBrowserProbe() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__VALIDATION_REPORT__, { timeout: 120000 });
    return await page.evaluate(async () => {
      const [
        { gameState },
        { setCanonicalMapContext },
        { render },
        { dispatch },
        { saveManager },
        { loadMap },
        { executeSysCallImpl },
        { SYSCALL_TYPES }
      ] = await Promise.all([
        import('/src/engine/state.js'),
        import('/src/engine/map_context.js'),
        import('/src/engine/renderer.js'),
        import('/src/engine/pipeline/dispatch.js'),
        import('/src/save/save_manager.js'),
        import('/src/engine/loader.js'),
        import('/src/engine/pipeline/syscalls/execute_syscall.js'),
        import('/src/engine/pipeline/plan_types.js')
      ]);

      const baseMap = await loadMap('steelcross_port');
      setCanonicalMapContext(gameState, 'steelcross_port', baseMap, 'debug-social-discover-regression');
      gameState.ui.page = 'map';
      gameState.ui.overlay = null;
      gameState.ui.profileOpen = false;
      gameState.ui.recordsOpen = false;
      gameState.ui.socialOpen = false;
      gameState.player.social = { byNpcId: {}, order: [] };
      render();

      const helpers = {
        applyLoadedSnapshot: (snapshotState) => snapshotState,
        applyCommittedEffects: () => ({ ok: true })
      };

      await executeSysCallImpl({
        type: SYSCALL_TYPES.LOAD_MAP,
        params: { mapId: 'steelcross_port_theseus_crew_intro' }
      }, gameState, [], helpers);
      const naturalRienEntry = gameState.player.social?.byNpcId?.npc_rien || null;

      gameState.player.social = { byNpcId: {}, order: [] };
      render();

      const anonymousReport = await dispatch('debug_social_discover_npc', { npcId: 'npc_rien' }, { returnReport: true, suppressFeedback: true });
      const anonymousEntry = gameState.player.social?.byNpcId?.npc_rien || null;

      const repeatedAnonymousReport = await dispatch('debug_social_discover_npc', { npcId: 'npc_rien' }, { returnReport: true, suppressFeedback: true });
      const repeatedAnonymousEntry = gameState.player.social?.byNpcId?.npc_rien || null;

      const linReport = await dispatch('debug_social_discover_npc', { npcId: 'npc_lin' }, { returnReport: true, suppressFeedback: true });
      const linEntry = gameState.player.social?.byNpcId?.npc_lin || null;
      const repeatedLinReport = await dispatch('debug_social_discover_npc', { npcId: 'npc_lin' }, { returnReport: true, suppressFeedback: true });
      const linEntryAfterRepeat = gameState.player.social?.byNpcId?.npc_lin || null;

      const hardReport = await dispatch('debug_social_discover_npc', { npcId: 'npc_hard' }, { returnReport: true, suppressFeedback: true });
      const hardEntry = gameState.player.social?.byNpcId?.npc_hard || null;
      const repeatedHardReport = await dispatch('debug_social_discover_npc', { npcId: 'npc_hard' }, { returnReport: true, suppressFeedback: true });
      const hardEntryAfterRepeat = gameState.player.social?.byNpcId?.npc_hard || null;

      const saveResult = saveManager.saveToSlot('auto', gameState, { sourceActionId: 'debug_social_discover_regression' });
      const loadResult = saveManager.loadFromSlot('auto');
      const loadedLinEntry = loadResult?.snapshotState?.player?.social?.byNpcId?.npc_lin || null;
      const loadedHardEntry = loadResult?.snapshotState?.player?.social?.byNpcId?.npc_hard || null;
      const loadedRienEntry = loadResult?.snapshotState?.player?.social?.byNpcId?.npc_rien || null;

      return {
        naturalRien: naturalRienEntry,
        rien: {
          reportRows: anonymousReport?.report?.social?.results || [],
          entry: anonymousEntry,
          repeatedReportRows: repeatedAnonymousReport?.report?.social?.results || [],
          repeatedEntry: repeatedAnonymousEntry
        },
        lin: {
          reportRows: linReport?.report?.social?.results || [],
          entry: linEntry,
          repeatedReportRows: repeatedLinReport?.report?.social?.results || [],
          entryAfterRepeat: linEntryAfterRepeat
        },
        hard: {
          reportRows: hardReport?.report?.social?.results || [],
          entry: hardEntry,
          repeatedReportRows: repeatedHardReport?.report?.social?.results || [],
          entryAfterRepeat: hardEntryAfterRepeat
        },
        persistence: {
          saveOk: saveResult?.ok === true,
          loadOk: loadResult?.ok === true,
          loadedLinEntry,
          loadedHardEntry,
          loadedRienEntry
        }
      };
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  const server = startServer();
  try {
    const serverReadyOutput = await waitForServerReady(server);
    log('server-ready', serverReadyOutput.stdout);

    const result = await runBrowserProbe();

  assert(result.naturalRien?.discovered === true, 'expected natural npc_rien discovered', result.naturalRien);
  assert(result.naturalRien?.dossierFlags?.nameKnown === true, 'expected natural npc_rien nameKnown=true', result.naturalRien);
  assert(Array.isArray(result.naturalRien?.unlockedDossierEntryIds) && result.naturalRien.unlockedDossierEntryIds.includes('npc_rien_first_meet_001'), 'expected natural npc_rien to unlock first meet entry', result.naturalRien);

    assert(result.lin.entry?.discovered === true, 'expected npc_lin discovered', result.lin);
    assert(result.lin.entry?.dossierFlags?.nameKnown === true, 'expected npc_lin nameKnown=true', result.lin);
    assert(Array.isArray(result.lin.entry?.unlockedDossierEntryIds) && result.lin.entry.unlockedDossierEntryIds.length >= 1, 'expected npc_lin to unlock at least one dossier entry', result.lin);
    assert(Array.isArray(result.lin.repeatedReportRows) && result.lin.repeatedReportRows.length === 0, 'expected repeated npc_lin discover to add no social rows', result.lin);
    assert(new Set(result.lin.entryAfterRepeat?.unlockedDossierEntryIds || []).size === (result.lin.entryAfterRepeat?.unlockedDossierEntryIds || []).length, 'expected npc_lin unlockedDossierEntryIds to remain deduplicated', result.lin);

    assert(result.hard.entry?.discovered === true, 'expected npc_hard discovered', result.hard);
    assert(result.hard.entry?.dossierFlags?.nameKnown === true, 'expected npc_hard nameKnown=true', result.hard);
    assert(Array.isArray(result.hard.entry?.unlockedDossierEntryIds) && result.hard.entry.unlockedDossierEntryIds.length >= 1, 'expected npc_hard to unlock at least one dossier entry', result.hard);
    assert(Array.isArray(result.hard.repeatedReportRows) && result.hard.repeatedReportRows.length === 0, 'expected repeated npc_hard discover to add no social rows', result.hard);
    assert(new Set(result.hard.entryAfterRepeat?.unlockedDossierEntryIds || []).size === (result.hard.entryAfterRepeat?.unlockedDossierEntryIds || []).length, 'expected npc_hard unlockedDossierEntryIds to remain deduplicated', result.hard);

    assert(result.rien.entry?.discovered === true, 'expected npc_rien discovered', result.rien);
  assert(result.rien.entry?.dossierFlags?.nameKnown === true, 'expected npc_rien nameKnown=true', result.rien);
    assert(Array.isArray(result.rien.entry?.unlockedDossierEntryIds) && result.rien.entry.unlockedDossierEntryIds.length >= 1, 'expected npc_rien to unlock at least one dossier entry', result.rien);
    assert(Array.isArray(result.rien.repeatedReportRows) && result.rien.repeatedReportRows.length === 0, 'expected repeated npc_rien discover to add no social rows', result.rien);
    assert(new Set(result.rien.entryAfterRepeat?.unlockedDossierEntryIds || []).size === (result.rien.entryAfterRepeat?.unlockedDossierEntryIds || []).length, 'expected npc_rien unlockedDossierEntryIds to remain deduplicated', result.rien);

    assert(result.persistence.saveOk === true, 'expected save success', result.persistence);
    assert(result.persistence.loadOk === true, 'expected load success', result.persistence);
    assert(result.persistence.loadedLinEntry?.discovered === true && result.persistence.loadedLinEntry?.dossierFlags?.nameKnown === true, 'expected npc_lin state to persist after load', result.persistence);
    assert(result.persistence.loadedHardEntry?.discovered === true && result.persistence.loadedHardEntry?.dossierFlags?.nameKnown === true, 'expected npc_hard state to persist after load', result.persistence);
    assert(result.persistence.loadedRienEntry?.discovered === true && result.persistence.loadedRienEntry?.dossierFlags?.nameKnown === true, 'expected npc_rien state to persist after load', result.persistence);
    assert(Array.isArray(result.persistence.loadedRienEntry?.unlockedDossierEntryIds) && result.persistence.loadedRienEntry.unlockedDossierEntryIds.length >= 1, 'expected npc_rien entries to persist after load', result.persistence);

    log('natural-rien-truth-sample', result.naturalRien);
    log('lin-truth-sample', result.lin.entry);
    log('hard-truth-sample', result.hard.entry);
    log('rien-truth-sample', result.rien.entry);
    log('persistence', result.persistence);
    console.log('debug social discover regression passed');
  } finally {
    if (server.exitCode == null) {
      server.kill('SIGTERM');
      await delay(200);
    }
  }
}

main().catch((error) => {
  console.error('debug social discover regression failed');
  console.error(error?.payload ?? error);
  process.exit(1);
});