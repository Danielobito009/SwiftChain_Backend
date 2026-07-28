import fs from 'fs';
import path from 'path';
import loadEnv from '../config/env';
import AuthTokenService from '../services/authTokenService';
import SimulatedDriverConnection from '../services/socketConnectionService';
import { ConnectionResult, LoadTestFixtures, LoadTestSummary } from '../models/types';

const FIXTURES_PATH = path.resolve(__dirname, '../../../.tmp/seed-output.json');

function loadFixtures(): LoadTestFixtures {
  if (!fs.existsSync(FIXTURES_PATH)) {
    throw new Error(
      `No seed fixtures found at ${FIXTURES_PATH}. Run "npm run seed" in load-tests/ first.`,
    );
  }
  return JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8')) as LoadTestFixtures;
}

function summarize(
  results: ConnectionResult[],
  requested: number,
  durationSec: number,
): LoadTestSummary {
  const connected = results.filter((r) => r.connected);
  const connectLatencies = connected
    .map((r) => r.connectLatencyMs)
    .filter((v): v is number => v !== null);

  return {
    requestedConnections: requested,
    connected: connected.length,
    failedToConnect: results.length - connected.length,
    totalUpdatesSent: results.reduce((sum, r) => sum + r.updatesSent, 0),
    totalAcksReceived: results.reduce((sum, r) => sum + r.acksReceived, 0),
    totalAcksFailed: results.reduce((sum, r) => sum + r.acksFailed, 0),
    avgConnectLatencyMs: connectLatencies.length
      ? Math.round(connectLatencies.reduce((a, b) => a + b, 0) / connectLatencies.length)
      : 0,
    durationSec,
  };
}

/**
 * Controller layer: reads config + fixtures, ramps up N concurrent
 * simulated driver WebSocket connections against the real Socket.IO
 * gateway, waits for the run to complete, and reports a summary.
 */
export async function runSocketLoadTest(): Promise<LoadTestSummary> {
  const env = loadEnv();
  const fixtures = loadFixtures();

  if (fixtures.drivers.length === 0) {
    throw new Error('No seeded drivers available. Run "npm run seed" first.');
  }

  const tokenService = new AuthTokenService(env.baseUrl, 'v1', fixtures.password);

  // eslint-disable-next-line no-console
  console.log(
    `Starting WebSocket load test: ${env.connections} connections, ` +
      `ramp-up ${env.rampUpMs}ms, duration ${env.durationSec}s, ` +
      `emit every ${env.emitIntervalMs}ms`,
  );

  const durationMs = env.durationSec * 1000;
  const runs: Promise<ConnectionResult>[] = [];

  for (let i = 0; i < env.connections; i += 1) {
    const driver = fixtures.drivers[i % fixtures.drivers.length];
    const delivery = fixtures.deliveries[i % fixtures.deliveries.length];

    const startDelayMs = Math.floor((i / env.connections) * env.rampUpMs);

    const runPromise = new Promise<ConnectionResult>((resolve) => {
      setTimeout(() => {
        tokenService
          .login(driver)
          .then((token) =>
            new SimulatedDriverConnection({
              baseUrl: env.baseUrl,
              namespace: env.namespace,
              driver,
              token,
              delivery,
              connectionIndex: i,
              durationMs,
              emitIntervalMs: env.emitIntervalMs,
            }).run(),
          )
          .then(resolve)
          .catch((error: Error) =>
            resolve({
              connectionIndex: i,
              connected: false,
              authenticated: false,
              updatesSent: 0,
              acksReceived: 0,
              acksFailed: 0,
              errors: [error.message],
              connectLatencyMs: null,
            }),
          );
      }, startDelayMs);
    });

    runs.push(runPromise);
  }

  const results = await Promise.all(runs);
  const summary = summarize(results, env.connections, env.durationSec);

  // eslint-disable-next-line no-console
  console.log('WebSocket load test summary:');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));

  const failedConnections = results.filter((r) => !r.connected);
  if (failedConnections.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`${failedConnections.length} connection(s) failed:`);
    failedConnections.slice(0, 10).forEach((r) => {
      // eslint-disable-next-line no-console
      console.warn(`  #${r.connectionIndex}: ${r.errors.join('; ')}`);
    });
  }

  return summary;
}

export default runSocketLoadTest;
