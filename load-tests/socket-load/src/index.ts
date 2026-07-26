import runSocketLoadTest from './controllers/socketLoadController';

runSocketLoadTest()
  .then((summary) => {
    const successRate = summary.connected / summary.requestedConnections;
    process.exitCode = successRate >= 0.95 ? 0 : 1;
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('WebSocket load test failed to run:', error);
    process.exitCode = 1;
  });
