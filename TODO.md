# Event Poller Implementation - TODO

## Steps

- [x] 1. Create `src/models/EventLog.ts` — Mongoose model to persist last processed ledger per event type
- [x] 2. Create `src/services/eventPoller.ts` — Continuous polling loop with event dispatch
- [x] 3. Edit `src/server.ts` — Integrate start/stop of event poller
- [ ] 4. Verify TypeScript compilation (`npx tsc --noEmit`)
- [ ] 5. Run existing tests to ensure no regressions

