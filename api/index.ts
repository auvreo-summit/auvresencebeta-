// Reuse the real backend, including Firebase verification and PostgreSQL.
// Do not start a listening server inside a Vercel function.
export { default } from '../server.ts';
