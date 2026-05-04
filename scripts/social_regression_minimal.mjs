import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const PORT = 5500;
const BASE_URL = `http://${HOST}:${PORT}/?social_regression_minimal=${Date.now()}`;

function log(message, payload = null) {
  if (payload == null) {
    console.log(`[social-regression] ${message}`);
    return;
  }
  console.log(`[social-regression] ${message}`, payload);
}

function assert(condition, message, payload = null) {
  if (!condition) {
    const error = new Error(message);
    if (payload != null) {
      error.payload = payload;
    }
    throw error;
  }
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
    const result = await page.evaluate(async () => {
      const [
        { loadMap },
        { gameState },
        { setCanonicalMapContext },
        { render },
        { dispatch },
        { saveManager }
      ] = await Promise.all([
        import('/src/engine/loader.js'),
        import('/src/engine/state.js'),
        import('/src/engine/map_context.js'),
        import('/src/engine/renderer.js'),
        import('/src/engine/pipeline/dispatch.js'),
        import('/src/save/save_manager.js')
      ]);

      const map = await loadMap('bayport_clinic_queue_intro_2');
      setCanonicalMapContext(gameState, 'bayport_clinic_queue_intro_2', map, 'social-regression-minimal');
      gameState.ui.page = 'map';
      gameState.ui.overlay = null;
      gameState.ui.profileOpen = false;
      gameState.ui.recordsOpen = false;
      gameState.ui.socialOpen = false;
      gameState.player.social = { byNpcId: {}, order: [] };
      render();

      const hostBefore = !!document.querySelector('#social-overlay-host .social-panel-overlay');
      const openReport = await dispatch('ui_social_open', null, { returnReport: true, suppressFeedback: true });
      const hostOpen = !!document.querySelector('#social-overlay-host .social-panel-overlay');
      const closeReport = await dispatch('ui_social_close', null, { returnReport: true, suppressFeedback: true });
      render();
      const hostClosed = !!document.querySelector('#social-overlay-host .social-panel-overlay');

      setCanonicalMapContext(gameState, 'bayport_clinic_queue_intro_2', map, 'social-regression-minimal-reset');
      gameState.ui.page = 'map';
      gameState.ui.overlay = null;
      gameState.ui.profileOpen = false;
      gameState.ui.recordsOpen = false;
      gameState.ui.socialOpen = false;
      gameState.player.social = { byNpcId: {}, order: [] };
      render();

      const actionReport = await dispatch('queue_intro_take_bill', null, { returnReport: true, suppressFeedback: true });
      const socialResults = actionReport?.report?.social?.results || [];
      const saveResult = saveManager.saveToSlot(1, gameState, { sourceActionId: 'social_regression_minimal' });
      const loadResult = saveManager.loadFromSlot(1);

      return {
        openClose: {
          hostBefore,
          hostOpen,
          hostClosed,
          openActionId: openReport?.report?.action?.id || null,
          closeActionId: closeReport?.report?.action?.id || null
        },
        socialResults,
        saveResult: {
          ok: saveResult?.ok === true,
          reasonCode: saveResult?.audit?.reasonCode || null
        },
        loadResult: {
          ok: loadResult?.ok === true,
          playerSocial: loadResult?.snapshotState?.player?.social || null
        },
        liveState: {
          playerSocial: gameState.player.social
        }
      };
    });
    return result;
  } finally {
    await browser.close();
  }
}

async function main() {
  const server = startServer();
  let serverReadyOutput = null;
  try {
    serverReadyOutput = await waitForServerReady(server);
    log("server-ready", serverReadyOutput.stdout);

    const result = await runBrowserProbe();

    assert(result.openClose.hostBefore === false, "expected social overlay closed before open", result.openClose);
    assert(result.openClose.hostOpen === true, "expected ui_social_open to show social overlay", result.openClose);
    assert(result.openClose.hostClosed === false, "expected ui_social_close to clear social overlay", result.openClose);
    assert(result.openClose.openActionId === "ui_social_open", "unexpected open action id", result.openClose);
    assert(result.openClose.closeActionId === "ui_social_close", "unexpected close action id", result.openClose);

    assert(Array.isArray(result.socialResults) && result.socialResults.length === 1, "expected exactly one social report row", result.socialResults);
    const firstRow = result.socialResults[0] || {};
    assert(firstRow.npcId === "npc_lin", "unexpected npcId in social report", firstRow);
    assert(firstRow.discoveredBefore === false, "expected discoveredBefore=false", firstRow);
    assert(firstRow.discoveredAfter === true, "expected discoveredAfter=true", firstRow);
    assert(firstRow.relationStageBefore == null, "expected relationStageBefore=null", firstRow);
    assert(firstRow.relationStageAfter === "stranger", "expected relationStageAfter=stranger", firstRow);

    assert(result.saveResult.ok === true, "expected saveToSlot success", result.saveResult);
    assert(result.loadResult.ok === true, "expected loadFromSlot success", result.loadResult);
    assert(result.loadResult.playerSocial?.byNpcId?.npc_lin?.discovered === true, "expected npc_lin discovered after load", result.loadResult);
    assert(result.loadResult.playerSocial?.byNpcId?.npc_lin?.relationStageId === "stranger", "expected npc_lin relationStageId=stranger after load", result.loadResult);

    log("open-close", result.openClose);
    log("social-results", result.socialResults);
    log("save-result", result.saveResult);
    log("load-result", result.loadResult);
    console.log("social regression minimal passed");
  } finally {
    if (server.exitCode == null) {
      server.kill("SIGTERM");
      await delay(200);
    }
  }
}

main().catch((error) => {
  console.error("social regression minimal failed");
  console.error(error?.payload ?? error);
  process.exit(1);
});