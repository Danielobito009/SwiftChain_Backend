// Tell mongodb-memory-server to use MongoDB 7.0.14.
// The 6.0.9 binary downloaded previously was corrupt (truncated download),
// causing a SIGSEGV on startup. 7.0.14 is verified to work on this machine.
process.env.MONGOMS_VERSION = '7.0.14';
